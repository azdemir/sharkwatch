// Integrated demo sessions (Replay + Live, one server).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { getTelegramChannel } from '@/lib/telegram-server';
import { CONFIRM_FRAMES, type SessionEvent, type TrackSummary } from '../shared/events.ts';
import type { ClipManifest } from '../shared/manifest.ts';
import { draftWithAgent, templateDraft } from './alerts/agent.ts';
import { alertHub } from './alerts/hub.ts';
import { AlertService, type AlertChannel } from './alerts/service.ts';
import { config, liveAvailable } from './config.ts';
import { EventBus, recordTo } from './events/bus.ts';
import { LiveSamSource } from './pipeline/sam-source.ts';
import { runSession } from './pipeline/session.ts';
import { SparkVerifier } from './pipeline/verifier.ts';
export interface SessionHandle { id: string; clipId: string; mode: 'live' | 'replay'; bus: EventBus; dir: string; abort: AbortController; alerts: AlertService; }
export const DATA_DIR = join(process.cwd(), 'data');
export const SESSIONS_DIR = join(DATA_DIR, 'sessions');
export const GOLDEN_DIR = join(SESSIONS_DIR, 'golden');
export function clipDir(clipId: string): string { return join(DATA_DIR, 'clips', clipId); }
const g = globalThis as unknown as { __demoSessions?: Map<string, SessionHandle> };
if (!g.__demoSessions) g.__demoSessions = new Map();
const sessions = g.__demoSessions;
export function getSession(id: string): SessionHandle | undefined { return sessions.get(id); }
export function listClips(): ClipManifest[] {
  const root = join(DATA_DIR, 'clips');
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((id) => existsSync(join(root, id, 'manifest.json'))).map((id) => JSON.parse(readFileSync(join(root, id, 'manifest.json'), 'utf8')) as ClipManifest).sort((a, b) => clipRank(a) - clipRank(b) || a.id.localeCompare(b.id));
}
function clipRank(m: ClipManifest): number { return m.demo ? 2 : m.scene?.shorelinePx.length ? 0 : 1; }
export function loadManifest(clipId: string): ClipManifest | undefined {
  if (!/^[\w-]+$/.test(clipId)) return undefined;
  const path = join(clipDir(clipId), 'manifest.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ClipManifest) : undefined;
}
export interface RecordingInfo { id: string; clipId: string; golden: boolean; }
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
function newId(clipId: string, mode: string): string { return `${clipId}-${mode}-${Date.now().toString(36)}`; }
export class LiveUnavailableError extends Error {}
function demoTelegramChannel(): AlertChannel | undefined {
  const channel = getTelegramChannel();
  if (!channel) return undefined;
  const gg = globalThis as unknown as { __sharkwatchDemoTelegramAck?: boolean };
  if (!gg.__sharkwatchDemoTelegramAck) {
    gg.__sharkwatchDemoTelegramAck = true;
    channel.onAcknowledge(({ alertId, by }) => {
      // Hub first. If that misses — e.g. the hub was reset by a reload —
      // fall back to the session that actually holds this alert. That
      // service publishes straight onto its patrol bus, which the demo UI
      // listens to even after the patrol ends, so the ack still reaches
      // the UI instead of vanishing silently.
      const hubAcked = alertHub.acknowledge(alertId, 'lifeguards', by);
      let fallbackSession: string | undefined;
      if (!hubAcked) {
        for (const session of sessions.values()) {
          if (session.alerts.acknowledge(alertId, 'lifeguards', by)) { fallbackSession = session.id; break; }
        }
      }
      // Diagnostic log I can read from the Mac after a tap, so a missing
      // UI update stops being a guess: if no line appears here, the tap
      // never reached this server at all (old server still polling, or
      // another process ate it); if a line appears with neither ack, the
      // alert is not in this server's sessions.
      try {
        const logPath = join(DATA_DIR, '.cache', 'telegram-acks.jsonl');
        mkdirSync(dirname(logPath), { recursive: true });
        appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), alertId, by, hubAcked: Boolean(hubAcked), fallbackSession: fallbackSession ?? null })}\n`);
      } catch {
        // Logging must never break the ack itself.
      }
    });
  }
  return { broadcast: async (alert) => (await channel.broadcast(alert)).size };
}
// Paid Muse Spark alert-drafting calls in this server process, capped by AGENT_CALL_BUDGET (vite parity).
let agentCalls = 0;
function alertServiceFor(bus: EventBus, sessionId: string, clipId: string, dir: string, opts: { live?: boolean; locationName?: string } = {}): AlertService {
  const manifest = loadManifest(clipId);
  // Paid Muse Spark drafting runs ONLY for Live sessions. Replay stays free and
  // template-only, exactly as before — a replay must never spend API calls.
  const service = new AlertService({ bus, sessionId, clipId, locationName: opts.locationName ?? manifest?.scene?.beachName ?? clipId, sessionDir: dir, draft: async (r) => {
    if (!opts.live) return templateDraft(r, 'Templates used (integrated demo, Replay only)');
    if (!liveAvailable()) return templateDraft(r, 'No Meta key: templates used');
    if (agentCalls >= config.agentCallBudget) return templateDraft(r, `Agent call budget (${config.agentCallBudget}) reached: templates used`);
    agentCalls++;
    return draftWithAgent(r);
  }, // 2026-11-04: patrol Telegram restored at the operator's explicit
  // instruction ("fix it now") after the 2026-11-04 gate stopped Vercel
  // Replay patrols notifying anyone. Patrol alerts — Replay and Live —
  // send to real Telegram subscribers again, as they did before that
  // gate, and are labelled as a simulated exercise in the message.
  // Trade-off, stated plainly: anyone who runs a patrol on the public
  // Vercel demo will also trigger a real Telegram message to
  // subscribers. The /api/telegram test endpoint and report broadcasts
  // remain gated by TELEGRAM_REAL_ALERTS=1.
  telegram: demoTelegramChannel(), escalateAfterS: 45, onChange: (alert) => alertHub.publish(alert) });
  alertHub.register(sessionId, service);
  return service;
}
const REPLAY_LEAD_S = 2;
const REPLAY_VERDICT_DELAY_S = 1.5;
export function replaySchedule(events: SessionEvent[], fps: number): { event: SessionEvent; atS: number }[] {
  let horizon = -1;
  const firstSeenAt = new Map<string, number>();
  const seen = new Map<string, number>();
  const confirmedAt = new Map<string, number>();
  const introduced = new Set<string>();
  const verifyingAt = new Map<string, number>();
  const decided = new Set<string>();
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
    } else if (event.type === 'session.started') { atS = 0; }
    else if (event.type === 'track.updated') {
      const id = event.track.id;
      const verdict = event.track.verdict ?? 'pending';
      if (final.has(verdict) && verifyingAt.has(id) && !decided.has(id)) {
        const basedOn = event.track.verification?.basedOnFrame;
        const ready = basedOn === undefined ? chunkEnd() : Math.max(verifyingAt.get(id)!, (basedOn + 1) / fps);
        atS = ready + REPLAY_VERDICT_DELAY_S;
        decided.add(id);
        early.add(event);
      } else if (verdict === 'verifying' && !verifyingAt.has(id)) { atS = Math.min(confirmedAt.get(id) ?? chunkEnd(), chunkEnd()); verifyingAt.set(id, atS); }
      else if (!introduced.has(id)) { atS = Math.min(firstSeenAt.get(id) ?? chunkEnd(), chunkEnd()); }
      else { atS = chunkEnd(); }
      introduced.add(id);
    } else { atS = chunkEnd(); }
    return { event, atS, order };
  });
  const end = scheduled.find((s) => s.event.type === 'session.ended');
  if (end) { end.atS = Math.max(...scheduled.map((s) => s.atS)); end.order = Infinity; }
  scheduled.sort((a, b) => a.atS - b.atS || a.order - b.order);
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
export function startReplaySession(recordingId: string, speed = 1): SessionHandle {
  const dir = join(SESSIONS_DIR, recordingId);
  if (relative(SESSIONS_DIR, dir).startsWith('..') || !existsSync(join(dir, 'events.jsonl'))) throw new Error(`unknown recording ${recordingId}`);
  const recorded = readFileSync(join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as SessionEvent).filter((e) => e.type !== 'alert.updated');
  const started = recorded[0];
  if (started?.type !== 'session.started') throw new Error(`${recordingId} is not a session recording`);
  const id = newId(started.clipId, 'replay');
  const bus = new EventBus(id);
  const handle: SessionHandle = { id, clipId: started.clipId, mode: 'replay', bus, dir, abort: new AbortController(), alerts: alertServiceFor(bus, id, started.clipId, dir) };
  sessions.set(id, handle);
  // Replay re-runs saved SAM output, so its chunk costs are 0 and the only real
  // cost is the recorded total on session.ended — which the UI only saw at the
  // very end (and never on Stop). Surface that recorded total from the first
  // chunk onward, so the nav bar shows a real cost during the patrol, not $0.000.
  const recordedCost = (recorded.find((e) => e.type === 'session.ended') as { costUsd?: number } | undefined)?.costUsd ?? 0;
  const t0 = performance.now();
  void (async () => {
    for (const { event, atS } of replaySchedule(recorded, started.fps)) {
      const due = atS / speed - (performance.now() - t0) / 1000;
      if (due > 0) await new Promise((r) => setTimeout(r, due * 1000));
      if (handle.abort.signal.aborted) { bus.emit({ type: 'session.ended', reason: 'stopped', message: 'stopped by the operator', costUsd: recordedCost }); break; }
      const { sessionId: _sid, seq: _seq, t: _t, ...body } = event;
      if (body.type === 'session.started') bus.emit({ ...body, mode: 'replay' });
      else if (body.type === 'chunk.timing') bus.emit({ ...body, costUsd: recordedCost });
      else bus.emit(body);
    }
  })();
  return handle;
}

// Live sessions below.
// Live SAM 3.1 + Muse Spark over an already-built manifest.
// manifestDir holds playback.mp4: data/clips/<id> for committed clips,
// data/uploads/<id> for uploaded footage. Uploads analyse as fast as the
// API allows (realtime false); committed clips use vite's realtime true.
// Throws LiveUnavailableError with no key or a wrong passcode; an API error
// ends the session with reason error and a warning, never invented boxes.
export function startLiveSession(manifest: ClipManifest, passcode?: string, opts: { manifestDir?: string; realtime?: boolean; locationName?: string } = {}): SessionHandle {
  if (!liveAvailable()) throw new LiveUnavailableError('Live mode needs a Meta key. Add MODEL_API_KEY (or META_KEY) to .env next to package.json, then restart the dev server.');
  if (config.livePasscode && passcode !== config.livePasscode) throw new LiveUnavailableError('wrong or missing passcode');
  const id = newId(manifest.id, 'live');
  const dir = join(SESSIONS_DIR, id);
  const bus = new EventBus(id);
  recordTo(bus, join(dir, 'events.jsonl'));
  const handle: SessionHandle = { id, clipId: manifest.id, mode: 'live', bus, dir, abort: new AbortController(), alerts: alertServiceFor(bus, id, manifest.id, dir, { live: true, locationName: opts.locationName }) };
  sessions.set(id, handle);
  runSession({
    manifest,
    bus,
    sam: new LiveSamSource(join(dir, 'raw')),
    verifier: new SparkVerifier(),
    sessionDir: dir,
    realtime: opts.realtime ?? true,
    prompts: 'live',
    signal: handle.abort.signal,
    dir: opts.manifestDir,
  }).catch((error: Error) => {
    // An operator stop that surfaces as a thrown abort is a stop, not a failure.
    if (!bus.ended) bus.emit({ type: 'session.ended', reason: handle.abort.signal.aborted ? 'stopped' : 'error', message: handle.abort.signal.aborted ? 'stopped by the operator' : error.message, costUsd: 0 });
  });
  return handle;
}

// Live session over a committed clip (data/clips/<id>/manifest.json).
export function startLiveClipSession(clipId: string, passcode?: string): SessionHandle {
  const manifest = loadManifest(clipId);
  if (!manifest) throw new Error(`unknown clip ${clipId}`);
  return startLiveSession(manifest, passcode);
}
