// Folds the session event stream into what the console shows. Pure, so it is unit-tested and a
// replayed recording produces exactly the same state as the live session did.

import type { AlertJson } from '../../shared/alerts.ts';
import type { ChunkTiming, FrameObject, SessionEvent, TrackSummary } from '../../shared/events.ts';
import { speciesPhrase } from '../../shared/risk.ts';

export type SessionStatus = 'idle' | 'connecting' | 'running' | 'ended' | 'error';

export interface LogEntry {
  t: number;
  level: 'info' | 'alert' | 'warn';
  text: string;
}

export interface SessionState {
  status: SessionStatus;
  sessionId?: string;
  started?: Extract<SessionEvent, { type: 'session.started' }>;
  /** Detections by global analysis frame. */
  frames: Map<number, FrameObject[]>;
  /** Highest analysis frame with results; the video may not play past it. */
  horizonFrame: number;
  tracks: Map<string, TrackSummary>;
  /** Session time at which each track's verdict (shark, ruled out, uncertain) first landed. */
  verdictAt: Map<string, number>;
  /** Alerts raised in this session, in the order they were raised. */
  alerts: Map<string, AlertJson>;
  /** Session time at which each alert reached this console (after Muse Spark drafted it). */
  alertSentAt: Map<string, number>;
  timings: ChunkTiming[];
  costUsd: number;
  log: LogEntry[];
  /** Highest event sequence applied; repeats after a reconnect are ignored. */
  lastSeq: number;
  endReason?: string;
  error?: string;
}

export const initialSession: SessionState = {
  status: 'idle',
  lastSeq: -1,
  frames: new Map(),
  horizonFrame: -1,
  tracks: new Map(),
  verdictAt: new Map(),
  alerts: new Map(),
  alertSentAt: new Map(),
  timings: [],
  costUsd: 0,
  log: [],
};

export type SessionAction =
  | { type: 'connecting'; sessionId: string }
  | { type: 'event'; event: SessionEvent }
  /** From the server-wide alert stream: acknowledgements and all-clears can come after the patrol ends. */
  | { type: 'alert'; alert: AlertJson }
  | { type: 'error'; message: string }
  | { type: 'reset' };

const fmtM = (m: number) => (m < 10 ? m.toFixed(1) : m.toFixed(0));
const FINAL_VERDICTS = new Set(['shark', 'not_shark', 'uncertain', 'too_small']);

function describeVerdict(t: TrackSummary): LogEntry['text'] | undefined {
  const v = t.verification;
  if (!v) return undefined;
  const size = t.length && t.length.reliable !== false ? `, ${fmtM(t.length.meters)} m` : t.length ? `, length not trusted (${t.length.unreliableReason === 'unstable' ? 'outline unstable' : 'merged outline'})` : '';
  if (t.verdict === 'shark') {
    const near = t.nearestPersonM !== undefined ? `, ${fmtM(t.nearestPersonM)} m from a person` : '';
    return `${t.id} confirmed: ${speciesPhrase(v) ?? 'shark, species unclear'} (${Math.round(v.confidence * 100)}%)${size}${near}`;
  }
  if (t.verdict === 'not_shark') return `${t.id} ruled out: ${v.label.replace(/_/g, ' ')} (${Math.round(v.confidence * 100)}%)`;
  if (t.verdict === 'uncertain') return `${t.id} needs a human look: ${v.label.replace(/_/g, ' ')} at ${Math.round(v.confidence * 100)}%`;
  return undefined;
}

/** Log lines for what changed in an alert since the last version seen. */
function alertLog(previous: AlertJson | undefined, a: AlertJson, t: number): LogEntry[] {
  const out: LogEntry[] = [];
  if (!previous) {
    const to = a.recipients.length ? a.recipients.map((r) => r.name.replace(' (simulated)', '')).join(', ') : 'nobody (advisory, logged only)';
    out.push({ t, level: a.level === 'advisory' ? 'info' : 'alert', text: `${a.level.toUpperCase()} alert ${a.id} sent to ${to}` });
  }
  for (const r of a.recipients) {
    const before = previous?.recipients.find((p) => p.role === r.role);
    if (r.status === 'acknowledged' && before?.status !== 'acknowledged') {
      out.push({ t, level: 'info', text: `${r.name.replace(' (simulated)', '')} acknowledged ${a.id}${r.acknowledgedBy ? ` (${r.acknowledgedBy})` : ''}` });
    }
  }
  if (a.status === 'escalated' && previous?.status !== 'escalated') out.push({ t, level: 'warn', text: `${a.id} escalated: nobody acknowledged in time` });
  if (a.status === 'resolved' && previous && previous.status !== 'resolved') {
    out.push({ t, level: 'info', text: a.resolvedBy?.startsWith('superseded') ? `${a.id} ${a.resolvedBy}` : `All clear: ${a.id} stood down by ${a.resolvedBy ?? 'the operator'}` });
  }
  return out;
}

/** Applies an alert version if it is newer than the one held; the same alert arrives on two streams. */
function upsertAlert(state: SessionState, alert: AlertJson, t: number): SessionState {
  const previous = state.alerts.get(alert.id);
  if (previous && previous.version >= alert.version) return state;
  const alerts = new Map(state.alerts);
  alerts.set(alert.id, alert);
  const alertSentAt = previous ? state.alertSentAt : new Map(state.alertSentAt).set(alert.id, t);
  return { ...state, alerts, alertSentAt, log: [...state.log, ...alertLog(previous, alert, t)] };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'reset':
      return initialSession;
    case 'connecting':
      return { ...initialSession, status: 'connecting', sessionId: action.sessionId };
    case 'error':
      return { ...state, status: 'error', error: action.message };
    case 'alert':
      return action.alert.sessionId === state.sessionId ? upsertAlert(state, action.alert, state.log.at(-1)?.t ?? 0) : state;
    case 'event':
      break;
  }

  const e = action.event;
  if ((state.sessionId && e.sessionId !== state.sessionId) || e.seq <= state.lastSeq) return state;
  state = { ...state, lastSeq: e.seq };

  switch (e.type) {
    case 'session.started':
      return {
        ...state,
        status: 'running',
        started: e,
        log: [...state.log, { t: e.t, level: 'info', text: `${e.mode === 'live' ? 'Live' : 'Replay'} patrol started over ${e.beachName ?? e.clipId}` }],
      };

    case 'frames': {
      const frames = new Map(state.frames);
      let horizon = state.horizonFrame;
      for (const f of e.frames) {
        frames.set(f.frame, f.objects);
        horizon = Math.max(horizon, f.frame);
      }
      return { ...state, frames, horizonFrame: horizon };
    }

    case 'track.updated': {
      const previous = state.tracks.get(e.track.id);
      const tracks = new Map(state.tracks);
      // Verdicts never go backwards; an update that still says "verifying" only refreshes position.
      const keepVerdict = previous && FINAL_VERDICTS.has(previous.verdict ?? '') && !FINAL_VERDICTS.has(e.track.verdict ?? '');
      const track = keepVerdict ? { ...e.track, verdict: previous.verdict, verification: previous.verification, evidence: previous.evidence } : e.track;
      tracks.set(e.track.id, track);
      const log = [...state.log];
      let verdictAt = state.verdictAt;
      if (previous?.verdict !== track.verdict) {
        const text = describeVerdict(track);
        if (text) log.push({ t: e.t, level: track.verdict === 'shark' ? 'alert' : 'info', text });
        if (FINAL_VERDICTS.has(track.verdict ?? '') && !verdictAt.has(track.id)) verdictAt = new Map(verdictAt).set(track.id, e.t);
      }
      return { ...state, tracks, verdictAt, log };
    }

    case 'chunk.timing': {
      const ms = Object.values(e.timing.samMs).filter((v) => v > 0);
      // Recordings re-run over saved SAM output carry no timing; don't print zeros.
      const detail = ms.length ? ` (SAM ${(Math.max(...ms) / 1000).toFixed(1)} s, ${e.timing.framesBilled} frames)` : '';
      return {
        ...state,
        timings: [...state.timings, e.timing],
        // Never let a 0-cost chunk erase a cost already shown (Replay chunks are 0).
        costUsd: Math.max(state.costUsd, e.costUsd),
        log: [...state.log, { t: e.t, level: 'info', text: `Chunk ${e.timing.chunk} analysed${detail}` }],
      };
    }

    case 'alert.updated':
      return upsertAlert(state, e.alert, e.t);

    case 'warning':
      return { ...state, log: [...state.log, { t: e.t, level: 'warn', text: e.message }] };

    case 'session.ended':
      return {
        ...state,
        status: 'ended',
        endReason: e.reason,
        // Surface the failure message in state, not only in the log:
        // otherwise a rejected Meta key still reads as a clean patrol
        // unless the operator opens the event log.
        error: e.reason === 'error' || e.reason === 'budget' ? (e.message ?? e.reason) : undefined,
        costUsd: Math.max(state.costUsd, e.costUsd),
        log: [...state.log, { t: e.t, level: e.reason === 'completed' || e.reason === 'stopped' ? 'info' : 'warn', text: e.reason === 'completed' ? 'Patrol complete' : e.reason === 'stopped' ? 'Patrol stopped by the operator' : `Patrol ended: ${e.message ?? e.reason}` }],
      };
  }
}

const RANK: Record<string, number> = { shark: 0, uncertain: 1, verifying: 2, pending: 3, not_shark: 4 };
const byImportance = (a: TrackSummary, b: TrackSummary) => {
  const ka = a.kind === 'person' ? 5 : (RANK[a.verdict ?? 'pending'] ?? 3);
  const kb = b.kind === 'person' ? 5 : (RANK[b.verdict ?? 'pending'] ?? 3);
  return ka - kb || (a.nearestPersonM ?? Infinity) - (b.nearestPersonM ?? Infinity);
};

/** Tracks shown in the side panel: on screen now, most important first. */
export function visibleTracks(state: SessionState): TrackSummary[] {
  return Array.from(state.tracks.values()).filter((t) => t.verdict !== 'too_small' && t.lifecycle === 'active').sort(byImportance);
}

/**
 * Animals that have left the frame but stay on the record, at their last known position: those
 * Muse Spark ruled on. Unconfirmed candidates that flickered and vanished are dropped.
 */
export function departedTracks(state: SessionState): TrackSummary[] {
  return Array.from(state.tracks.values())
    .filter((t) => t.lifecycle === 'lost' && t.kind === 'animal' && (t.verdict === 'shark' || t.verdict === 'uncertain' || t.verdict === 'not_shark'))
    .sort(byImportance);
}
