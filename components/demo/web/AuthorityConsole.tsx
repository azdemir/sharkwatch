// A phone-friendly console for one (simulated) authority: alerts addressed to it arrive live and
// can be acknowledged. Open /console?role=lifeguards | beach_management | coastal_security.

import { useEffect, useMemo, useState } from 'react';
import { RECIPIENT_NAMES, type AlertJson, type RecipientRole } from '../shared/alerts.ts';
import { LEVEL_SIGN, LevelFlag, SharkWatchMark } from './components/Flags.tsx';
import { api } from './lib/api.ts';

const ROLES = Object.keys(RECIPIENT_NAMES) as RecipientRole[];
const RULE: Record<AlertJson['level'], string> = { warning: 'bg-purple', critical: 'bg-red', advisory: 'bg-ink-3' };
const clockTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
const agency = (role: RecipientRole) => RECIPIENT_NAMES[role].replace(' (simulated)', '');

function roleFromUrl(): RecipientRole {
  const role = new URLSearchParams(window.location.search).get('role') as RecipientRole | null;
  return role && ROLES.includes(role) ? role : 'lifeguards';
}

function Dispatch({ alert, role, onAcknowledge, inBar }: { alert: AlertJson; role: RecipientRole; onAcknowledge: () => void; inBar: boolean }) {
  const me = alert.recipients.find((r) => r.role === role)!;
  const pending = alert.status !== 'resolved' && me.status !== 'acknowledged';
  const sign = LEVEL_SIGN[alert.level];
  const superseded = alert.resolvedBy?.startsWith('superseded');
  return (
    <article className={`relative border border-rule bg-sheet ${pending ? '' : 'opacity-80'}`}>
      {pending && <span className={`absolute inset-y-0 -left-px w-[3px] ${RULE[alert.level]}`} aria-hidden />}
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <LevelFlag level={alert.level} className="h-10 w-10 shrink-0 text-ink" />
        <div className="min-w-0 flex-1">
          <div className={`signage text-[28px] ${sign.color}`}>{sign.word}</div>
          <div className="mt-1 text-[12px] text-ink-2">{sign.line}</div>
        </div>
        <span className="num shrink-0 font-mono text-[11px] text-ink-3">{clockTime(alert.createdAt)}</span>
      </div>
      <div className={`h-[3px] ${RULE[alert.level]}`} />

      <div className="px-4 pb-4 pt-3">
        {alert.status === 'escalated' && <p className="mb-2 font-mono text-[11px] font-bold tracking-wide text-red">ESCALATED · NOBODY ACKNOWLEDGED IN TIME</p>}
        <h2 className="text-[17px] font-[640] leading-snug">{alert.headline}</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed">{me.message}</p>
        {alert.evidence && (
          <img src={api.evidenceUrl(alert.sessionId, alert.evidence)} alt="Drone frame with the shark outlined" className="mt-3 aspect-video w-full border border-rule object-cover" loading="lazy" />
        )}
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-rule pt-2">
          <div className="min-w-0">
            <div className="place truncate text-[16px]">{alert.location.name.replace(/ \(simulated.*\)$/, '')}</div>
            <div className="num font-mono text-[11px] text-ink-2">
              {alert.location.lat.toFixed(5)}, {alert.location.lon.toFixed(5)}
            </div>
          </div>
          <a
            className="shrink-0 text-[13px] text-ink underline decoration-rule-strong underline-offset-[3px]"
            href={`https://www.openstreetmap.org/?mlat=${alert.location.lat}&mlon=${alert.location.lon}#map=18/${alert.location.lat}/${alert.location.lon}`}
            target="_blank"
            rel="noreferrer"
          >
            Open map ↗
          </a>
        </div>

        <div className="mt-4">
          {alert.status === 'resolved' ? (
            <p className={`text-[14px] ${superseded ? 'text-ink-2' : 'font-[600] text-green'}`}>
              {superseded ? `Replaced by a newer alert (${alert.resolvedBy!.replace('superseded by ', '')})` : `All clear, given by ${alert.resolvedBy} at ${clockTime(alert.resolvedAt)}`}
            </p>
          ) : me.status === 'acknowledged' ? (
            <p className="text-[14px] font-[600] text-green">
              ✓ Acknowledged by {me.acknowledgedBy} at {clockTime(me.acknowledgedAt)}
            </p>
          ) : (
            <>
              <p className="text-[13px] font-[640]">Awaiting your acknowledgement{inBar ? ': use the button below.' : '.'}</p>
              {!inBar && (
                <button type="button" onClick={onAcknowledge} className="mt-2 h-12 w-full rounded-[2px] bg-ink text-[15px] font-[680] text-paper hover:bg-[#22333e]">
                  Acknowledge: we're responding
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function AuthorityConsole() {
  const [role, setRole] = useState<RecipientRole>(roleFromUrl);
  const [alerts, setAlerts] = useState<Map<string, AlertJson>>(new Map());
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('sharkwatch.console.name') ?? '';
    } catch {
      return '';
    }
  });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource(api.alertsStreamUrl());
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(es.readyState === EventSource.OPEN);
    es.onmessage = (m) => {
      const alert = JSON.parse(m.data) as AlertJson;
      setAlerts((prev) => new Map(prev).set(alert.id, alert));
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('role', role);
    window.history.replaceState(null, '', url);
    document.title = `${agency(role)} · SharkWatch`;
  }, [role]);

  const mine = useMemo(
    () => [...alerts.values()].filter((a) => a.recipients.some((r) => r.role === role)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [alerts, role],
  );
  const pendingAlerts = mine.filter((a) => a.status !== 'resolved' && a.recipients.find((r) => r.role === role)?.status !== 'acknowledged');
  const awaiting = pendingAlerts.length;
  const next = pendingAlerts[0];

  async function acknowledge(alert: AlertJson) {
    const by = name.trim() || agency(role);
    try {
      localStorage.setItem('sharkwatch.console.name', name.trim());
    } catch {
      // Remembering the name is a convenience only.
    }
    const updated = await api.acknowledge(alert.id, role, by).catch(() => undefined);
    if (!updated) return;
    if ('id' in updated) {
      setAlerts((prev) => new Map(prev).set(updated.id, updated));
    } else if (updated.acknowledged) {
      // Shared-store fallback (the Vercel case): the server only returns
      // { acknowledged, alertId, by }, not a full AlertJson, so build the
      // acknowledged state from the alert this console already holds.
      setAlerts((prev) => {
        const next = new Map(prev);
        const current = next.get(alert.id);
        if (current) {
          next.set(current.id, {
            ...current,
            version: current.version + 1,
            status: 'acknowledged' as const,
            recipients: current.recipients.map((r) =>
              r.role === role ? { ...r, status: 'acknowledged' as const, acknowledgedBy: updated.by } : r,
            ),
          });
        }
        return next;
      });
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <header className="flex items-center justify-between border-b-[4px] border-double border-ink px-4 py-2.5">
        <div className="flex items-center gap-2">
          <SharkWatchMark className="h-6 w-6" />
          <span className="text-[16px] font-[780] tracking-[-0.015em] [font-stretch:86%]">SharkWatch</span>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-2">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green' : 'beacon bg-yellow'}`} />
          {connected ? 'linked' : 'connecting'}
        </span>
      </header>
      <div className="hatch flex items-center border-b border-rule px-4 py-1">
        <span className="bg-paper px-1.5 text-[11.5px] text-ink-2">Exercise: simulated alerts, no real agency is contacted</span>
      </div>

      <div className="px-4 pt-4">
        <div className="label">Authority console</div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as RecipientRole)}
          className="mt-0.5 w-full appearance-none bg-transparent bg-[length:14px] bg-[right_2px_center] bg-no-repeat pr-6 text-[26px] font-[700] tracking-[-0.01em] [font-stretch:90%]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%2314212a' stroke-width='1.4'/%3E%3C/svg%3E\")" }}
          aria-label="Authority"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {agency(r)}
            </option>
          ))}
        </select>


        <label className="mt-4 flex items-baseline gap-3 border-b border-rule-strong pb-1.5">
          <span className="shrink-0 text-[12px] text-ink-2">Signing as</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tower 3"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
          />
        </label>

        <p className={`mt-4 text-[13px] ${awaiting ? 'font-[640] text-ink' : 'text-ink-2'}`}>
          {awaiting ? `${awaiting} alert${awaiting === 1 ? '' : 's'} awaiting acknowledgement` : 'No alerts awaiting you.'}
        </p>
      </div>

      <div className={`flex flex-col gap-4 px-4 pt-3 ${next ? 'pb-24' : 'pb-8'}`}>
        {mine.length === 0 && (
          <div className="chart-grid border border-rule px-6 py-10 text-center text-[13px] text-ink-2">
            <LevelFlag level="open" className="mx-auto mb-2 h-10 w-10 text-ink-3" />
            Waiting for alerts. Start a patrol in the operator console; alerts for {agency(role)} appear here.
          </div>
        )}
        {mine.map((alert) => (
          <Dispatch key={alert.id} alert={alert} role={role} onAcknowledge={() => acknowledge(alert)} inBar={alert.id === next?.id} />
        ))}
      </div>

      {/* The newest alert awaiting this agency, one thumb-reach away however far the card scrolls. */}
      {next && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink bg-paper/95 px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5">
          <div className="mx-auto max-w-lg">
            <button type="button" onClick={() => acknowledge(next)} className="flex h-14 w-full items-center justify-between rounded-[2px] bg-ink px-4 text-paper hover:bg-[#22333e]">
              <span className="text-left leading-tight">
                <span className="block text-[16px] font-[700]">Acknowledge</span>
                <span className="block text-[12px] text-paper/75">We're responding</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-paper/80">
                <span className={`h-2.5 w-2.5 ${RULE[next.level]}`} />
                {LEVEL_SIGN[next.level].word}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
