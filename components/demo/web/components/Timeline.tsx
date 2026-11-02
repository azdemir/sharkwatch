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
    <div key={key} className="group flex h-[20px] items-center">
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
            className={`absolute top-1/2 h-[10px] -translate-y-1/2 ${tone} ${selected ? 'outline outline-1 outline-offset-1 outline-ink' : ''} ${onClick ? 'cursor-pointer' : ''}`}
            style={{ left: pct(s.firstFrame / fps, d), width: `max(3px, ${pct(Math.max(0, Math.min((s.lastFrame + 1) / fps, upTo) - s.firstFrame / fps), d)})` }}
          />
        ))}
        {marker !== undefined && marker <= upTo && (
          <span className="absolute top-1/2 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-paper bg-ink" style={{ left: pct(marker, d) }} title={`Confirmed at ${marker.toFixed(1)} s`} />
        )}
      </div>
    </div>
  );

  return (
    <section className="flex h-full min-h-0 flex-col pb-3">
      <header className="card-head">
        <h2 className="label">Patrol timeline</h2>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
          <span className="flex items-center gap-1"><span className="h-[10px] w-3 bg-orange" />shark</span>
          <span className="flex items-center gap-1"><span className="h-[10px] w-3 bg-yellow" />being checked</span>
          <span className="flex items-center gap-1"><span className="h-[10px] w-[10px] rotate-45 bg-ink" />confirmed</span>
          <span className="hidden items-center gap-0.5 sm:flex"><LevelFlag level="warning" className="h-3.5 w-3.5 text-ink" />alert</span>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 px-5 pt-3">
        {/* Ruler and alert flags. One shared track: the 40px label column, then the
            same flex-1 track the bars use below, so a tick, a flag, a diamond and a
            bar edge at the same second sit on exactly the same vertical line.
            Edge labels are clamped to the track (not centred on it), so 0s no longer
            hangs left of the bar start and the last label no longer hangs right. */}
        <div className="flex h-8 items-end">
          <span className="w-10 shrink-0" />
          <div className="relative h-full flex-1 border-b border-rule-strong">
            {ticks.map((s) => (
              <span key={s} className={`absolute bottom-0 w-px ${s % step === 0 ? 'h-2 bg-rule-strong' : 'h-1 bg-rule'}`} style={{ left: pct(s, d) }}>
                {s % step === 0 && (
                  <span
                    className="num absolute bottom-2.5 font-mono text-[10px] text-ink-3"
                    style={{ left: 0, transform: s === 0 ? 'translateX(0)' : s >= Math.floor(d) ? 'translateX(-100%)' : 'translateX(-50%)' }}
                  >
                    {s}s
                  </span>
                )}
              </span>
            ))}
            {alerts.map((a) => {
              const sent = state.alertSentAt.get(a.id) ?? a.sessionT;
              return (
              <span key={a.id} className="absolute bottom-0 -translate-x-[3px]" style={{ left: pct(sent, d) }} title={`${a.level} alert sent at ${sent.toFixed(1)} s`}>
                <LevelFlag level={a.level} className="h-4 w-4 text-ink" />
              </span>
              );
            })}
          </div>
        </div>

        <div className="relative mt-1.5 space-y-[6px]">
          {/* Faint gridlines at the labelled seconds, same pct() as ruler and bars. */}
          <div className="pointer-events-none absolute inset-y-0 left-10 right-0" aria-hidden="true">
            {ticks.filter((s) => s % step === 0).map((s) => (
              <span key={s} className="absolute inset-y-0 w-px bg-rule/40" style={{ left: pct(s, d) }} />
            ))}
          </div>
          {lanes.length === 0 && people.length === 0 && (
            <p className="pl-10 pt-2 text-[12px] text-ink-3">Contacts appear here as SAM 3.1 finds them.</p>
          )}
          {lanes.map((t) =>
            lane(t.id, t.id, [t], BAR[t.verdict!] ?? BAR.verifying!, () => onSelect(t.id === selectedId ? undefined : t.id), t.id === selectedId, state.verdictAt.get(t.id)),
          )}
          {people.length > 0 && lane('people', 'ppl', people, 'bg-sheet border border-ink-3')}
          {/* Playhead over the lanes only, on the same track as the bars: its
              triangle sits at the top of the lanes, not floating in the ruler. */}
          {state.status !== 'idle' && (
            <div className="pointer-events-none absolute inset-y-0 left-10 right-0">
              <span className="absolute inset-y-0 w-px bg-ink" style={{ left: pct(playhead, d) }}>
                <span className="absolute -left-[3px] top-0 h-0 w-0 border-x-[3.5px] border-t-[5px] border-x-transparent border-t-ink" />
              </span>
            </div>
          )}
        </div>
        {animals.length > lanes.length && <p className="mt-1 pl-10 text-[11px] text-ink-3">+{animals.length - lanes.length} more contacts</p>}
      </div>
    </section>
  );
}
