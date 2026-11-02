// The beach's state at a glance, as the flag a lifeguard tower would fly, with the incident behind
// it: how fast it went from first sighting to alert, who was told, and who has acknowledged.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { AlertJson, DeliveryStatus } from '../../shared/alerts.ts';
import type { ClipInfo } from '../../shared/api.ts';
import { assessRisk, type RiskLevel } from '../../shared/risk.ts';
import { api, type TelegramInfo } from '../lib/api.ts';
import type { SessionState } from '../lib/sessionState.ts';
import { LEVEL_SIGN, LevelFlag } from './Flags.tsx';

const clockTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');

const DELIVERY: Record<DeliveryStatus, string> = { sent: 'text-ink-3', delivered: 'text-ink-2', acknowledged: 'text-green' };

function Sign({ flag, word, line, color }: { flag: AlertJson['level'] | 'open'; word: string; line: string; color: string }) {
  return (
    <div className="flex items-start gap-3">
      <LevelFlag level={flag} className={`h-11 w-11 shrink-0 ${flag === 'open' ? 'text-ink-3' : 'text-ink'}`} />
      <div className="min-w-0 pt-0.5">
        <div className={`signage text-[28px] ${color}`}>{word}</div>
        <div className="mt-1.5 text-[13px] text-ink-2">{line}</div>
      </div>
    </div>
  );
}

/** Patrol clock, as on the video: 00:03.4. */
export const clock = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** First sighting → confirmed by Muse Spark → alert out: the number that says how fast this is. */
function Timing({ alert, state }: { alert: AlertJson; state: SessionState }) {
  const fps = state.started?.fps ?? 10;
  const tracks = alert.trackIds.map((id) => state.tracks.get(id)).filter((t) => t !== undefined);
  if (!tracks.length) return null;
  const first = tracks.reduce((a, b) => (b.firstFrame < a.firstFrame ? b : a));
  const sighted = first.firstFrame / fps;
  const confirmed = state.verdictAt.get(first.id);
  const sent = state.alertSentAt.get(alert.id) ?? alert.sessionT;
  const notified = alert.recipients.length > 0;
  return (
    <div className="mt-4 border-t border-rule pt-3">
      <div className="flex items-end gap-3">
        <span className="num text-[36px] font-[700] leading-[1] tracking-[-0.02em]">{Math.max(0, sent - sighted).toFixed(1)} s</span>
        <span className="pb-0.5 text-[13px] leading-tight text-ink-2">
          from first sighting
          <br />
          to {notified ? 'alert sent' : 'sighting logged'}
        </span>
      </div>
      <p className="num mt-2 font-mono text-[11.5px] text-ink-2">
        sighted <span className="text-ink">{clock(sighted)}</span> → confirmed <span className="text-ink">{confirmed === undefined ? '–' : clock(confirmed)}</span> →{' '}
        {notified ? 'sent' : 'logged'} <span className="text-ink">{clock(sent)}</span>
      </p>
    </div>
  );
}

function Recipients({ alert }: { alert: AlertJson }) {
  if (!alert.recipients.length) return <p className="mt-3 text-[13px] text-ink-2">Logged only: an advisory notifies nobody.</p>;
  return (
    <ul className="mt-3 divide-y divide-rule border-b border-rule">
      {alert.recipients.map((r) => (
        <li key={r.role} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
          <span className="min-w-0 truncate">
            {r.name.replace(' (simulated)', '')}
            <span className="text-ink-3"> · {r.channels.join(' + ')}</span>
          </span>
          <span className={`num shrink-0 font-mono text-[12px] ${DELIVERY[r.status]}`}>
            {r.status === 'acknowledged' ? `✓ ${r.acknowledgedBy ?? 'acknowledged'} ${clockTime(r.acknowledgedAt)}` : r.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Actions({ alert }: { alert: AlertJson }) {
  const [busy, setBusy] = useState(false);
  const open = alert.status !== 'resolved';
  const link = 'text-[13px] text-ink-2 underline decoration-rule-strong underline-offset-[3px] hover:text-ink hover:decoration-ink';
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {open && alert.recipients.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await api.resolve(alert.id).catch(() => {});
            setBusy(false);
          }}
          className="rounded-none border border-green px-3 py-1 text-[13px] font-[640] text-green hover:bg-green hover:text-paper disabled:opacity-50"
        >
          All clear
        </button>
      )}
      <a href="/console?role=lifeguards" target="_blank" rel="noreferrer" className={link}>
        Lifeguard console ↗
      </a>
      <a href={api.capUrl(alert.id)} target="_blank" rel="noreferrer" className={link}>
        CAP XML
      </a>
      {alert.status === 'resolved' && !alert.resolvedBy?.startsWith('superseded') && (
        <a href={api.capUrl(alert.id, true)} target="_blank" rel="noreferrer" className={link}>
          All-clear CAP
        </a>
      )}
    </div>
  );
}

function TelegramLine() {
  const [info, setInfo] = useState<TelegramInfo>();
  const [qr, setQr] = useState<string>();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void api.telegram().then(setInfo).catch(() => setInfo({ enabled: false }));
  }, []);
  useEffect(() => {
    if (info?.link) void QRCode.toDataURL(info.link, { margin: 1, width: 168, color: { dark: '#14212a', light: '#faf7ef' } }).then(setQr);
  }, [info?.link]);
  if (!info) return null;
  if (!info.enabled) return null;
  return (
    <div className="text-[12px] text-ink-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="underline decoration-rule-strong underline-offset-[3px] hover:text-ink">
        Alerts on Telegram{info.username ? ` · @${info.username}` : ''}
      </button>
      <span className="text-ink-3"> · {info.subscribers ?? 0} subscribed</span>
      {open && qr && (
        <div className="mt-2 flex items-center gap-3">
          <img src={qr} alt={`QR code for ${info.link}`} className="h-24 w-24 border border-rule" />
          <span className="text-[12px]">
            Scan, then send <span className="font-mono text-ink">/start</span>. Alerts arrive as the (simulated) lifeguard dispatch, with an Acknowledge button.
          </span>
        </div>
      )}
    </div>
  );
}

export function StatusPanel({ state, clip }: { state: SessionState; clip?: ClipInfo }) {
  const alerts = Array.from(state.alerts.values());
  const current = [...alerts].reverse().find((a) => a.status !== 'resolved') ?? alerts.at(-1);
  const history = alerts.filter((a) => a !== current).reverse();
  const tracks = Array.from(state.tracks.values()).filter((t) => t.kind === 'animal' && t.verdict !== 'too_small');
  const confirmed = tracks.filter((t) => t.verdict === 'shark').length;
  const checking = tracks.filter((t) => t.verdict === 'verifying' || t.verdict === 'pending' || t.verdict === undefined).length;
  // Between Muse Spark confirming a shark and the alert landing (while its messages are written),
  // the level is already known: the risk engine is deterministic and shared with the server.
  const order: RiskLevel[] = ['advisory', 'warning', 'critical'];
  const incoming = tracks
    .map((t) => assessRisk(t)?.level)
    .filter((l) => l !== undefined)
    .sort((a, b) => order.indexOf(b) - order.indexOf(a))[0];

  let body;
  if (current) {
    const resolved = current.status === 'resolved';
    const sign = LEVEL_SIGN[current.level];
    body = (
      <>
        {resolved && !current.resolvedBy?.startsWith('superseded') ? (
          <Sign flag="open" word="All clear" line={`Given by ${current.resolvedBy ?? 'the operator'} · ${clockTime(current.resolvedAt)}`} color="text-green" />
        ) : (
          <Sign flag={current.level} word={sign.word} line={sign.line} color={sign.color} />
        )}
        {current.status === 'escalated' && <p className="mt-2 text-[12px] font-[640] text-red">Escalated: nobody acknowledged in time.</p>}
        <p className="mt-3 text-[14px] leading-snug">
          <span className="num mr-1.5 font-mono text-[11.5px] text-ink-3">at {clock(state.alertSentAt.get(current.id) ?? current.sessionT)}</span>
          {current.summary}
        </p>
        <Timing alert={current} state={state} />
        <Recipients alert={current} />
        <p className="mt-2 text-[12px] text-ink-3">
          {current.drafter === 'muse-spark' ? `Messages written by Muse Spark in ${((current.agentLatencyMs ?? 0) / 1000).toFixed(1)} s` : 'Template wording'}
          {current.draftNote ? ` · ${current.draftNote}` : ''}
          {current.telegramDelivered ? ` · on ${current.telegramDelivered} phone${current.telegramDelivered === 1 ? '' : 's'}` : ''}
        </p>
        <Actions alert={current} />
      </>
    );
  } else if (state.status === 'idle') {
    body = (
      <>
        <Sign flag="open" word="Standing by" line={clip ? `${clip.title} · ${clip.durationS.toFixed(0)} s of footage` : 'Choose footage to patrol'} color="text-ink-2" />
        <p className="mt-3 text-[13px] leading-snug text-ink-2">
          Press <span className="font-[640] text-ink">Start patrol</span>. Replay plays a recorded run of SAM 3.1 and Muse Spark at real-time speed; Live runs them on the footage now.
        </p>
      </>
    );
  } else if (incoming) {
    const sign = LEVEL_SIGN[incoming];
    const what = incoming === 'advisory' ? 'logging the sighting' : 'alert going out';
    body = (
      <>
        <Sign
          flag={incoming}
          word={sign.word}
          line={state.status === 'ended' ? `Shark confirmed · the patrol ended before the ${incoming === 'advisory' ? 'sighting was logged' : 'alert went out'}` : `Shark confirmed · ${what} now`}
          color={sign.color}
        />
        <p className="num mt-3 font-mono text-[12px] text-ink-2">
          {confirmed} shark{confirmed === 1 ? '' : 's'} confirmed · {checking} being checked
        </p>
      </>
    );
  } else {
    body = (
      <>
        <Sign flag="open" word="Water open" line={tracks.length ? 'No sharks confirmed' : 'No contacts yet'} color="text-ink" />
        <p className="num mt-3 font-mono text-[12px] text-ink-2">
          {tracks.length} contact{tracks.length === 1 ? '' : 's'} · {checking} being checked
        </p>
      </>
    );
  }

  return (
    <section className="px-5 pb-4 pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="label">Beach status</h2>
        <span className="flex shrink-0 items-center gap-1.5 border border-rule bg-sheet px-2 py-1 text-[11px] text-ink-2" title="No real agency is contacted">
          <span className="hatch h-3 w-3 border border-rule-strong" aria-hidden />
          Exercise · simulated agencies
        </span>
      </div>
      {body}
      {history.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-rule pt-2">
          {history.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-[12px] text-ink-3">
              <LevelFlag level={a.level} className="h-4 w-4 shrink-0 text-ink-3" />
              <span className="truncate">{a.headline}</span>
              <span className="ml-auto shrink-0 font-mono">{a.resolvedBy?.startsWith('superseded') ? 'superseded' : a.status}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <TelegramLine />
      </div>
    </section>
  );
}
