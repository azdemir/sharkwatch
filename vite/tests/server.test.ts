import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SessionEvent } from '../src/shared/events.ts';
import type { ClipManifest } from '../src/shared/manifest.ts';
import { buildApp } from '../src/server/app.ts';
import { EventBus, recordTo } from '../src/server/events/bus.ts';
import { RecordedSamSource } from '../src/server/pipeline/sam-source.ts';
import { runSession } from '../src/server/pipeline/session.ts';
import type { AlertJson } from '../src/shared/alerts.ts';
import { config } from '../src/server/config.ts';
import { replaySchedule, SESSIONS_DIR } from '../src/server/sessions.ts';

const RECORDING = `test-recording-${process.pid}`;
const recordingDir = join(SESSIONS_DIR, RECORDING);
let app: FastifyInstance;
let base: string;

beforeAll(async () => {
  // A small real recording: clip b's recorded SAM output, no verification.
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'clips', 'clip-b-swimmer', 'manifest.json'), 'utf8')) as ClipManifest;
  mkdirSync(recordingDir, { recursive: true });
  const bus = new EventBus(RECORDING);
  recordTo(bus, join(recordingDir, 'events.jsonl'));
  await runSession({ manifest, bus, sam: new RecordedSamSource(join(import.meta.dirname, 'fixtures', 'sessions', 'clip-b-swimmer')), verifier: null, sessionDir: recordingDir, realtime: false });

  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
}, 120_000);

afterAll(async () => {
  await app?.close();
  rmSync(recordingDir, { recursive: true, force: true });
});

/** Reads an SSE stream until `session.ended` (or a timeout). */
async function readEvents(url: string, timeoutMs = 20_000): Promise<SessionEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, { signal: controller.signal });
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const events: SessionEvent[] = [];
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let split: number;
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const data = block.split('\n').find((l) => l.startsWith('data: '));
        if (!data) continue;
        const event = JSON.parse(data.slice(6)) as SessionEvent;
        events.push(event);
        if (event.type === 'session.ended') {
          controller.abort();
          return events;
        }
      }
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') throw error;
  } finally {
    clearTimeout(timer);
  }
  return events;
}

describe('server', () => {
  it('reports health and lists clips with playback URLs', async () => {
    const health = await (await fetch(`${base}/api/health`)).json();
    expect(health.ok).toBe(true);
    const clips = (await (await fetch(`${base}/api/clips`)).json()) as { id: string; playbackUrl: string }[];
    expect(clips.map((c) => c.id)).toContain('clip-b-swimmer');
  });

  it('serves playback video with range requests, and nothing else from the clip folder', async () => {
    const res = await fetch(`${base}/media/clips/clip-b-swimmer/playback.mp4`, { headers: { Range: 'bytes=0-1023' } });
    expect(res.status).toBe(206);
    expect((await res.arrayBuffer()).byteLength).toBe(1024);
    for (const path of ['clip-b-swimmer/manifest.json', 'clip-b-swimmer/chunks/chunk-000.mp4', 'clip-b-swimmer/analysis.mp4']) {
      expect((await fetch(`${base}/media/clips/${path}`)).status).toBeGreaterThanOrEqual(400);
    }
  });

  it('replays a recording over server-sent events, in order and complete', async () => {
    const recordings = (await (await fetch(`${base}/api/recordings`)).json()) as { id: string }[];
    expect(recordings.map((r) => r.id)).toContain(RECORDING);

    const started = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'replay', recording: RECORDING, speed: 8 }),
    });
    const { sessionId } = (await started.json()) as { sessionId: string };
    const events = await readEvents(`${base}/api/sessions/${sessionId}/events`);
    const original = readFileSync(join(recordingDir, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as SessionEvent);

    expect(events[0]).toMatchObject({ type: 'session.started', mode: 'replay' });
    expect(events.at(-1)!.type).toBe('session.ended');
    // Same events (replay reorders them onto footage time), numbered afresh.
    const count = (list: SessionEvent[]) => list.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {});
    expect(count(events)).toEqual(count(original));
    expect(events.map((e) => e.seq)).toEqual([...events.keys()]);
  }, 30_000);

  it('schedules a replay in footage time: detections ahead of the playhead, verdicts after their chunk', () => {
    const original = readFileSync(join(recordingDir, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as SessionEvent);
    const schedule = replaySchedule(original, 10);
    for (let i = 1; i < schedule.length; i++) expect(schedule[i]!.atS).toBeGreaterThanOrEqual(schedule[i - 1]!.atS);
    for (const { event, atS } of schedule) {
      if (event.type === 'frames') expect(atS).toBeLessThanOrEqual(Math.max(0, event.frames[0]!.frame / 10 - 2) + 1e-9);
    }
    // The whole replay takes about as long as the footage, not as long as the live analysis did.
    expect(schedule.at(-1)!.atS).toBeCloseTo(161 / 10, 6);
  });

  it('times verdicts like a real-time system: verifying once confirmed, verdict after its evidence', () => {
    const t = { sessionId: 's', t: 0 };
    let seq = 0;
    const track = (verdict: string, verification?: object, later?: object) =>
      ({ ...t, seq: seq++, type: 'track.updated', track: { id: 'T1', kind: 'animal', lifecycle: 'active', verdict, concepts: ['shark'], firstFrame: 20, lastFrame: 59, framesSeen: 40, verification, ...later } }) as unknown as SessionEvent;
    const verification = (basedOnFrame?: number) => ({ is_shark: true, label: 'shark', confidence: 0.9, species_guess: '', species_confidence: 'low', behavior: '', evidence: [], latencyMs: 0, basedOnFrame });
    const frames = { ...t, seq: seq++, type: 'frames', chunk: 0, frames: Array.from({ length: 60 }, (_, f) => ({ frame: f, objects: f >= 20 ? [{ trackId: 'T1', kind: 'animal', box: [0, 0, 9, 9], confidence: 0.9 }] : [] })) } as unknown as SessionEvent;
    const events = [
      { ...t, seq: seq++, type: 'session.started', clipId: 'c', mode: 'live', fps: 10, playbackFps: 30, width: 10, height: 10, frameCount: 60 } as unknown as SessionEvent,
      frames,
      track('pending'),
      track('verifying'),
      track('verifying'), // a stale snapshot taken while the verdict was still pending
      // Logged after later chunks: the recording's summary already knows the shark left at frame 99.
      track('shark', verification(31), { lifecycle: 'lost', lastFrame: 99 }),
      { ...t, seq: seq++, type: 'session.ended', reason: 'completed', costUsd: 0 } as unknown as SessionEvent,
    ];
    const at = replaySchedule(events, 10).map(({ event, atS }) => `${event.type === 'track.updated' ? event.track.verdict : event.type}@${atS.toFixed(1)}`);
    // First seen at frame 20, confirmed on its 8th frame (27), shown to Muse Spark up to frame 31.
    expect(at).toEqual(['session.started@0.0', 'frames@0.0', 'pending@2.0', 'verifying@2.7', 'shark@4.7', 'verifying@6.0', 'session.ended@6.0']);
    // The moved verdict carries what was known at 4.7 s, not where the shark went afterwards.
    const verdict = replaySchedule(events, 10).find((s) => s.event.type === 'track.updated' && s.event.track.verdict === 'shark')!.event as Extract<SessionEvent, { type: 'track.updated' }>;
    expect(verdict.track).toMatchObject({ verdict: 'shark', lifecycle: 'active', lastFrame: 59 });
    expect(verdict.track.verification?.basedOnFrame).toBe(31);

    // Recordings without the evidence frame keep the old timing: chunk end plus the delay.
    const old = replaySchedule(events.map((e) => (e.type === 'track.updated' && e.track.verification ? track('shark', verification()) : e)), 10);
    expect(old.find((s) => s.event.type === 'track.updated' && s.event.track.verdict === 'shark')!.atS).toBeCloseTo(7.5, 6);
  });

  it('raises, acknowledges and resolves an alert during a replay, with CAP output', async () => {
    // Templates only: a test must never make paid Muse Spark calls.
    const key = config.modelApiKey;
    config.modelApiKey = undefined;
    try {
      const controller = new AbortController();
      const alerts: AlertJson[] = [];
      const seen = (async () => {
        const res = await fetch(`${base}/api/alerts/stream`, { signal: controller.signal });
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(chunk, { stream: true });
          for (const block of buffer.split('\n\n').slice(0, -1)) {
            const data = block.split('\n').find((l) => l.startsWith('data: '));
            if (data) alerts.push(JSON.parse(data.slice(6)) as AlertJson);
          }
          buffer = buffer.slice(buffer.lastIndexOf('\n\n') + 2);
          if (alerts.some((a) => a.clipId === 'clip-b-swimmer')) return;
        }
      })().catch(() => {});

      const started = await fetch(`${base}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'replay', recording: 'golden/clip-b-swimmer', speed: 8 }) });
      const { sessionId } = (await started.json()) as { sessionId: string };
      await Promise.race([seen, new Promise((r) => setTimeout(r, 15_000))]);
      controller.abort();

      const alert = alerts.find((a) => a.sessionId === sessionId)!;
      expect(alert).toBeDefined();
      // Nurse sharks right next to swimmers: lifeguards are told, the beach isn't closed.
      expect(alert).toMatchObject({ level: 'warning', drafter: 'template', status: 'sent', beachAction: 'warn_swimmers' });
      expect(alert.recipients.map((r) => r.role)).toEqual(['lifeguards']);

      const post = (path: string, body: object) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const acked = (await (await post(`/api/alerts/${alert.id}/ack`, { role: 'lifeguards', by: 'Tower 3' })).json()) as AlertJson;
      expect(acked.status).toBe('acknowledged');
      expect(acked.recipients[0]).toMatchObject({ status: 'acknowledged', acknowledgedBy: 'Tower 3' });
      expect((await post(`/api/alerts/${alert.id}/ack`, { role: 'nobody' })).status).toBe(400);

      const cap = await fetch(`${base}/api/alerts/${alert.id}/cap.xml`);
      expect(cap.headers.get('content-type')).toContain('application/xml');
      expect(await cap.text()).toContain('<status>Exercise</status>');

      const resolved = (await (await post(`/api/alerts/${alert.id}/resolve`, { by: 'Operator' })).json()) as AlertJson;
      expect(resolved.status).toBe('resolved');
      expect(await (await fetch(`${base}/api/alerts/${alert.id}/cap.xml?msgType=Cancel`)).text()).toContain('<msgType>Cancel</msgType>');
      await fetch(`${base}/api/sessions/${sessionId}/stop`, { method: 'POST' });
    } finally {
      config.modelApiKey = key;
    }
  }, 30_000);

  it('rejects bad session requests', async () => {
    const post = (body: object) => fetch(`${base}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ mode: 'live' })).status).toBe(400);
    expect((await post({ mode: 'replay', recording: '../../etc' })).status).toBe(400);
    expect((await fetch(`${base}/api/sessions/nope/events`)).status).toBe(404);
  });
});
