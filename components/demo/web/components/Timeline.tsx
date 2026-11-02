// The patrol on one footage-time ruler: when each contact was in view, when Muse Spark confirmed it,
// when alerts went out, and where the playhead is. It shows how quickly a sighting becomes an alert.

import type { ClipInfo } from '../../shared/api.ts';
import { CONFIRM_FRAMES, type TrackSummary } from '../../shared/events.ts';
import type { SessionState } from '../lib/sessionState.ts';
import { usePlayhead } from '../lib/playhead.ts';
import { LevelFlag } from './Flags.tsx';

const MAX_LANES = 4;
const RANK: Record<string, number> = { shark: 0, uncertain: 1, verifying: 2, not_shark: 3 };

const BAR: Record<string, string> = {
  shark: 'bg-orange',
  uncertain: 'bg-transparent border border-yellow-ink',
  verifying: 'bg-yellow',
  not_shark: 'bg-ink-3/35',
};

const pct = (t: number, d: number) => `${Math.min(100, Math.max(0, (t / d) * 100))}%`;

export function Timeline({ state, clip, selectedId, onSelect }: { state: SessionState; clip: ClipInfo; selectedId?: string; onSelect: (id: string | undefined) => void }) {
  const playhead = usePlayhead();
  // Only what has been seen so far: a bar never runs ahead of the footage on screen.
  const upTo = state.status === 'ended' ? Infinity : playhead;
  const fps = state.started?.fps ?? clip.fps;
  const d = Math.max(clip.durationS, 1);
  // A lane opens once a contact is confirmed (sent to Muse Spark); candidates that flicker for a few
  // frames and vanish never get one.
  const animals = Array.from(state.tracks.values()).filter(
    (t) => t.kind === 'animal' && t.verdict !== undefined && t.verdict !== 'pending' && t.verdict !== 'too_small' && t.firstFrame / fps <= upTo,
  );
  const lanes = [...animals]
    .sort((a, b) => (RANK[a.verdict!] ?? 3) - (RANK[b.verdict!] ?? 3) || a.firstFrame - b.firstFrame)
    .slice(0, MAX_LANES)
    .sort((a, b) => a.firstFrame - b.firstFrame);
  const people = Array.from(state.tracks.values()).filter((t) => t.kind === 'person' && t.framesSeen >= CONFIRM_FRAMES);
  const alerts = Array.from(state.alerts.values());
  const step = d > 30 ? 10 : d > 12 ? 5 : 2;
  const ticks = Array.from({ length: Math.floor(d) + 1 }, (_, i) => i);

  const lane = (key: string, label: string, spans: TrackSummary[], tone: string, onClick?: () => void, selected = false, marker?: number) => (
    <div key={key} className="group flex h-[14px] items-center">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`w-10 shrink-0 text-left font-mono text-[10.5px] ${selected ? 'font-bold text-ink' : 'text-ink-3'} enabled:hover:text-ink`}
      >
        {label}
      </button>
      <div className="relative h-full flex-1" onClick={onClick}>
        {spans.map((s) => (
          <span
            key={s.id}
            className={`absolute top-1/2 h-[6px] -translate-y-1/2 ${tone} ${selected ? 'outline outline-1 outline-offset-1 outline-ink' : ''} ${onClick ? 'cursor-pointer' : ''}`}
            style={{ left: pct(s.firstFrame / fps, d), width: `max(3px, ${pct(Math.max(0, Math.min((s.lastFrame + 1) / fps, upTo) - s.firstFrame / fps), d)})` }}
          />
        ))}
        {marker !== undefined && marker <= upTo && (
          <span className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-paper bg-ink" style={{ left: pct(marker, d) }} title={`Confirmed at ${marker.toFixed(1)} s`} />
        )}
      </div>
    </div>
  );

  return (
    <section className="flex h-full min-h-0 flex-col px-5 pb-3 pt-3">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="label">Patrol timeline</h2>
        <div className="flex items-center gap-3 text-[11px] text-ink-3">
          <span className="flex items-center gap-1"><span className="h-[6px] w-3 bg-orange" />shark</span>
          <span className="flex items-center gap-1"><span className="h-[6px] w-3 bg-yellow" />being checked</span>
          <span className="flex items-center gap-1"><span className="h-[7px] w-[7px] rotate-45 bg-ink" />confirmed</span>
          <span className="hidden items-center gap-0.5 sm:flex"><LevelFlag level="warning" className="h-3.5 w-3.5 text-ink" />alert</span>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {/* Ruler and alert flags. */}
        <div className="flex h-5 items-end">
          <span className="w-10 shrink-0" />
          <div className="relative h-full flex-1 border-b border-rule-strong">
            {ticks.map((s) => (
              <span key={s} className={`absolute bottom-0 w-px ${s % step === 0 ? 'h-2 bg-rule-strong' : 'h-1 bg-rule'}`} style={{ left: pct(s, d) }}>
                {s % step === 0 && <span className="num absolute bottom-2.5 -translate-x-1/2 font-mono text-[10px] text-ink-3">{s}s</span>}
              </span>
            ))}
            {alerts.map((a) => {
              const sent = state.alertSentAt.get(a.id) ?? a.sessionT;
              return (
              <span key={a.id} className="absolute -top-1 -translate-x-[3px]" style={{ left: pct(sent, d) }} title={`${a.level} alert sent at ${sent.toFixed(1)} s`}>
                <LevelFlag level={a.level} className="h-5 w-5 text-ink" />
              </span>
              );
            })}
          </div>
        </div>

        <div className="mt-1.5 space-y-[3px]">
          {lanes.length === 0 && people.length === 0 && (
            <p className="pl-10 pt-2 text-[12px] text-ink-3">Contacts appear here as SAM 3.1 finds them.</p>
          )}
          {lanes.map((t) =>
            lane(t.id, t.id, [t], BAR[t.verdict!] ?? BAR.verifying!, () => onSelect(t.id === selectedId ? undefined : t.id), t.id === selectedId, state.verdictAt.get(t.id)),
          )}
          {people.length > 0 && lane('people', 'ppl', people, 'bg-sheet border border-ink-3')}
        </div>
        {animals.length > lanes.length && <p className="mt-1 pl-10 text-[11px] text-ink-3">+{animals.length - lanes.length} more contacts</p>}

        {/* Playhead over the lanes. */}
        {state.status !== 'idle' && (
          <div className="pointer-events-none absolute inset-y-0 left-10 right-0">
            <span className="absolute inset-y-0 w-px bg-ink" style={{ left: pct(playhead, d) }}>
              <span className="absolute -left-[3px] top-[14px] h-0 w-0 border-x-[3.5px] border-t-[5px] border-x-transparent border-t-ink" />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
