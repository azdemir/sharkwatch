// Live and replayed sessions, addressable by id while the server runs.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CONFIRM_FRAMES, type SessionEvent, type TrackSummary } from '../shared/events.ts';
import type { ClipManifest } from '../shared/manifest.ts';
import { draftWithAgent, templateDraft } from './alerts/agent.ts';
import { alertHub, telegramAlertChannel } from './alerts/hub.ts';
import { AlertService } from './alerts/service.ts';
import { config } from './config.ts';
import { EventBus, recordTo } from './events/bus.ts';
import { clipDir, DATA_DIR } from './media/chunks.ts';
import { LiveSamSource } from './pipeline/sam-source.ts';
import { runSession } from './pipeline/session.ts';
import { SparkVerifier } from './pipeline/verifier.ts';

export interface SessionHandle {
  id: string;
  clipId: string;
  mode: 'live' | 'replay';
  bus: EventBus;
  /** Directory holding this session's evidence images. */
  dir: string;
  abort: AbortController;
  alerts: AlertService;
}

/**
 * Alerts are computed from the session's own track events, in Live and in Replay alike, so a
 * replayed patrol raises real (exercise) alerts on Telegram and the consoles at the right moment.
 */
let agentCalls = 0;

function alertServiceFor(bus: EventBus, sessionId: string, clipId: string, dir: string): AlertService {
  const manifest = loadManifest(clipId);
  const service = new AlertService({
    bus,
    sessionId,
    clipId,
    locationName: manifest?.scene?.beachName ?? clipId,
    sessionDir: dir,
    draft: async (r) => {
      if (!config.modelApiKey) return templateDraft(r, 'No Meta key: templates used');
      // Replays on a public deployment can be started by anyone; cap the paid agent calls.
      if (agentCalls >= config.agentCallBudget) return templateDraft(r, `Agent call budget (${config.agentCallBudget}) reached: templates used`);
      agentCalls++;
      return draftWithAgent(r);
    },
    telegram: telegramAlertChannel(),
    escalateAfterS: config.escalateAfterS,
    onChange: (alert) => alertHub.publish(alert),
  });
  alertHub.register(sessionId, service);
  return service;
}

export const SESSIONS_DIR = join(DATA_DIR, 'sessions');
export const GOLDEN_DIR = join(SESSIONS_DIR, 'golden');

const sessions = new Map<string, SessionHandle>();

export function getSession(id: string): SessionHandle | undefined {
  return sessions.get(id);
}

export function listClips(): ClipManifest[] {
  const root = join(DATA_DIR, 'clips');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((id) => existsSync(join(root, id, 'manifest.json')))
    .map((id) => JSON.parse(readFileSync(join(root, id, 'manifest.json'), 'utf8')) as ClipManifest)
    .sort((a, b) => clipRank(a) - clipRank(b) || a.id.localeCompare(b.id));
}

/** Beach patrols first, then offshore clips, then staged demos. */
function clipRank(m: ClipManifest): number {
  return m.demo ? 2 : m.scene?.shorelinePx.length ? 0 : 1;
}

export function loadManifest(clipId: string): ClipManifest | undefined {
  if (!/^[\w-]+$/.test(clipId)) return undefined;
  const path = join(clipDir(clipId), 'manifest.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ClipManifest) : undefined;
}

export interface RecordingInfo {
  /** Path relative to data/sessions, e.g. "golden/clip-b-swimmer". */
  id: string;
  clipId: string;
  golden: boolean;
}

/** Recorded sessions available for Replay: curated ones first, then this machine's own runs. */
export function listRecordings(): RecordingInfo[] {
  const out: RecordingInfo[] = [];
  const scan = (dir: string, golden: boolean) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const events = join(dir, name, 'events.jsonl');
      if (name === 'golden' || !existsSync(events)) continue;
      const first = readFileSync(events, 'utf8').split('\n', 1)[0];
      const started = first ? (JSON.parse(first) as SessionEvent) : undefined;
      if (started?.type !== 'session.started') continue;
      out.push({ id: relative(SESSIONS_DIR, join(dir, name)), clipId: started.clipId, golden });
    }
  };
  scan(GOLDEN_DIR, true);
  scan(SESSIONS_DIR, false);
  return out;
}

function newId(clipId: string, mode: string): string {
  return `${clipId}-${mode}-${Date.now().toString(36)}`;
}

export class LiveUnavailableError extends Error {}

export function startLiveSession(clipId: string, passcode?: string): SessionHandle {
  if (!config.modelApiKey) throw new LiveUnavailableError('Live mode needs a Meta key: run "npm run setup", then restart');
  if (config.livePasscode && passcode !== config.livePasscode) throw new LiveUnavailableError('wrong or missing passcode');
  const manifest = loadManifest(clipId);
  if (!manifest) throw new Error(`unknown clip ${clipId}`);

  const id = newId(clipId, 'live');
  const dir = join(SESSIONS_DIR, id);
  const bus = new EventBus(id);
  recordTo(bus, join(dir, 'events.jsonl'));
  const handle: SessionHandle = { id, clipId, mode: 'live', bus, dir, abort: new AbortController(), alerts: alertServiceFor(bus, id, clipId, dir) };
  sessions.set(id, handle);

  runSession({
    manifest,
    bus,
    sam: new LiveSamSource(join(dir, 'raw')),
    verifier: new SparkVerifier(),
    sessionDir: dir,
    realtime: true,
    prompts: 'live',
    signal: handle.abort.signal,
  }).catch((error: Error) => {
    if (!bus.ended) bus.emit({ type: 'session.ended', reason: 'error', message: error.message, costUsd: 0 });
  });
  return handle;
}

/** Seconds of detections delivered ahead of the playhead in a replay. */
const REPLAY_LEAD_S = 2;
/** Seconds a replayed track shows "Verifying…" before its recorded verdict appears: about one
 * Muse Spark call when nothing else is queued. */
const REPLAY_VERDICT_DELAY_S = 1.5;

/**
 * Replay timeline in footage time, as a real-time system would have produced it, rather than the
 * recording's wall-clock time (which includes this API tier's queueing):
 * - each chunk's detections are released just before the video reaches them;
 * - a track starts "verifying" on the frame it was confirmed (seen in CONFIRM_FRAMES frames);
 * - its verdict lands REPLAY_VERDICT_DELAY_S after the latest frame Muse Spark was shown, so a
 *   verdict never appears before the footage it rests on (older recordings, which don't say, fall
 *   back to the end of the chunk);
 * - everything else (lifecycle updates, chunk timings) when the footage reaches the chunk's end.
 */
export function replaySchedule(events: SessionEvent[], fps: number): { event: SessionEvent; atS: number }[] {
  let horizon = -1;
  // Footage times read from the detections themselves.
  const firstSeenAt = new Map<string, number>();
  const seen = new Map<string, number>();
  const confirmedAt = new Map<string, number>();
  const introduced = new Set<string>();
  const verifyingAt = new Map<string, number>();
  const decided = new Set<string>();
  // Verdict events moved earlier than where the recording logged them.
  const early = new Set<SessionEvent>();
  const final = new Set(['shark', 'not_shark', 'uncertain']);
  const chunkEnd = () => (horizon + 1) / fps;
  const scheduled = events.map((event, order) => {
    let atS: number;
    if (event.type === 'frames' && event.frames.length) {
      for (const f of event.frames) {
        for (const o of f.objects) {
          if (!firstSeenAt.has(o.trackId)) firstSeenAt.set(o.trackId, f.frame / fps);
          if ((o.confidence ?? 1) < 0.5 || confirmedAt.has(o.trackId)) continue;
          const n = (seen.get(o.trackId) ?? 0) + 1;
          seen.set(o.trackId, n);
          if (n >= CONFIRM_FRAMES) confirmedAt.set(o.trackId, f.frame / fps);
        }
      }
      atS = Math.max(0, event.frames[0]!.frame / fps - REPLAY_LEAD_S);
      horizon = Math.max(horizon, event.frames.at(-1)!.frame);
    } else if (event.type === 'session.started') {
      atS = 0;
    } else if (event.type === 'track.updated') {
      const id = event.track.id;
      const verdict = event.track.verdict ?? 'pending';
      if (final.has(verdict) && verifyingAt.has(id) && !decided.has(id)) {
        const basedOn = event.track.verification?.basedOnFrame;
        const ready = basedOn === undefined ? chunkEnd() : Math.max(verifyingAt.get(id)!, (basedOn + 1) / fps);
        atS = ready + REPLAY_VERDICT_DELAY_S;
        decided.add(id);
        early.add(event);
      } else if (verdict === 'verifying' && !verifyingAt.has(id)) {
        atS = Math.min(confirmedAt.get(id) ?? chunkEnd(), chunkEnd());
        verifyingAt.set(id, atS);
      } else if (!introduced.has(id)) {
        // A new track is introduced as soon as it appears, so its outline is labelled right away.
        atS = Math.min(firstSeenAt.get(id) ?? chunkEnd(), chunkEnd());
      } else {
        // Later refreshes, including stale "verifying" snapshots taken while a verdict was pending.
        atS = chunkEnd();
      }
      introduced.add(id);
    } else {
      atS = chunkEnd();
    }
    return { event, atS, order };
  });
  // The end comes after everything else: clients stop listening once a session has ended.
  const end = scheduled.find((s) => s.event.type === 'session.ended');
  if (end) {
    end.atS = Math.max(...scheduled.map((s) => s.atS));
    end.order = Infinity;
  }
  scheduled.sort((a, b) => a.atS - b.atS || a.order - b.order);
  // A moved verdict carries the track as the recording knew it later (where it went, when it left
  // the frame). Lay the verdict onto what was known at its new time instead, so nothing leaks ahead.
  const known = new Map<string, TrackSummary>();
  for (const s of scheduled) {
    if (s.event.type !== 'track.updated') continue;
    const { track } = s.event;
    const base = known.get(track.id);
    if (early.has(s.event) && base) {
      const length = base.length && track.length ? { ...base.length, reliable: track.length.reliable, unreliableReason: track.length.unreliableReason } : (base.length ?? track.length);
      s.event = { ...s.event, track: { ...base, verdict: track.verdict, verification: track.verification, evidence: track.evidence, length } };
    }
    known.set(track.id, s.event.track);
  }
  return scheduled.map(({ event, atS }) => ({ event, atS }));
}

/** Re-emits a recorded session on the footage-time schedule (scaled by `speed`). */
export function startReplaySession(recordingId: string, speed = 1): SessionHandle {
  const dir = join(SESSIONS_DIR, recordingId);
  if (relative(SESSIONS_DIR, dir).startsWith('..') || !existsSync(join(dir, 'events.jsonl'))) {
    throw new Error(`unknown recording ${recordingId}`);
  }
  // Alerts in a recording are dropped: the replay raises its own from the track events.
  const recorded = readFileSync(join(dir, 'events.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionEvent)
    .filter((e) => e.type !== 'alert.updated');
  const started = recorded[0];
  if (started?.type !== 'session.started') throw new Error(`${recordingId} is not a session recording`);

  const id = newId(started.clipId, 'replay');
  const bus = new EventBus(id);
  const handle: SessionHandle = {
    id,
    clipId: started.clipId,
    mode: 'replay',
    bus,
    dir,
    abort: new AbortController(),
    alerts: alertServiceFor(bus, id, started.clipId, dir),
  };
  sessions.set(id, handle);

  const t0 = performance.now();
  void (async () => {
    for (const { event, atS } of replaySchedule(recorded, started.fps)) {
      const due = atS / speed - (performance.now() - t0) / 1000;
      if (due > 0) await new Promise((r) => setTimeout(r, due * 1000));
      if (handle.abort.signal.aborted) {
        bus.emit({ type: 'session.ended', reason: 'error', message: 'stopped by the operator', costUsd: 0 });
        break;
      }
      const { sessionId: _sid, seq: _seq, t: _t, ...body } = event;
      bus.emit(body.type === 'session.started' ? { ...body, mode: 'replay' } : body);
    }
  })();
  return handle;
}
