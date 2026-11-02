import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FrameObject, SessionEvent, TrackSummary } from '../src/shared/events.ts';
import type { ClipManifest } from '../src/shared/manifest.ts';
import { EventBus } from '../src/server/events/bus.ts';
import { RecordedSamSource } from '../src/server/pipeline/sam-source.ts';
import { runSession } from '../src/server/pipeline/session.ts';
import type { BatchOutcome, TrackVerifier, VerifyBatchRequest } from '../src/server/pipeline/verifier.ts';
import { containRect, framePosition, objectsAt, sharkToPersonLinks, toneFor, labelFor } from '../src/web/lib/overlay.ts';
import { departedTracks, initialSession, sessionReducer, visibleTracks, type SessionState } from '../src/web/lib/sessionState.ts';

describe('overlay geometry', () => {
  it('letterboxes a portrait video inside a landscape element', () => {
    const r = containRect(720, 1280, 1600, 900);
    expect(r.scale).toBeCloseTo(900 / 1280, 6);
    expect(r.height).toBeCloseTo(900, 6);
    expect(r.x).toBeCloseTo((1600 - 720 * r.scale) / 2, 6);
    expect(r.y).toBe(0);
  });

  it('maps media time to analysis frame and progress', () => {
    expect(framePosition(0, 10)).toEqual({ frame: 0, fraction: 0 });
    expect(framePosition(1.25, 10)).toMatchObject({ frame: 12 });
    expect(framePosition(1.25, 10).fraction).toBeCloseTo(0.5, 6);
    // Floating-point times just under a frame boundary still land on the frame.
    expect(framePosition(0.3, 10).frame).toBe(3);
  });

  it('interpolates a track between analysis frames and leaves single-frame objects alone', () => {
    const o = (trackId: string, x: number): FrameObject => ({ trackId, kind: 'animal', box: [x, 10, x + 50, 30] });
    const frames = new Map<number, FrameObject[]>([
      [5, [o('T1', 100), o('T2', 400)]],
      [6, [o('T1', 120)]],
    ]);
    const drawn = objectsAt(frames, 0.525, 10); // frame 5, 25% toward 6
    expect(drawn.find((d) => d.object.trackId === 'T1')!.box[0]).toBeCloseTo(105, 6);
    expect(drawn.find((d) => d.object.trackId === 'T2')!.box[0]).toBe(400);
  });

  it('colours by verdict and hides small fish', () => {
    expect(toneFor('animal', 'shark')).toBe('shark');
    expect(toneFor('animal', 'verifying')).toBe('caution');
    expect(toneFor('animal', 'not_shark')).toBe('safe');
    expect(toneFor('animal', 'too_small')).toBe('hidden');
    expect(toneFor('person', undefined)).toBe('person');
  });

  it('links each confirmed shark to its nearest person in the frame', () => {
    const drawn = [
      { object: { trackId: 'T1', kind: 'animal' as const, box: [0, 0, 10, 10] as [number, number, number, number] }, box: [0, 0, 10, 10] as [number, number, number, number] },
      { object: { trackId: 'P1', kind: 'person' as const, box: [100, 0, 110, 10] as [number, number, number, number] }, box: [100, 0, 110, 10] as [number, number, number, number] },
      { object: { trackId: 'P2', kind: 'person' as const, box: [30, 0, 40, 10] as [number, number, number, number] }, box: [30, 0, 40, 10] as [number, number, number, number] },
      // Closest, but seen in only two frames: a flicker, not a swimmer.
      { object: { trackId: 'P3', kind: 'person' as const, box: [12, 0, 20, 10] as [number, number, number, number] }, box: [12, 0, 20, 10] as [number, number, number, number] },
    ];
    const tracks = new Map<string, TrackSummary>([
      ['T1', { id: 'T1', kind: 'animal', verdict: 'shark' } as TrackSummary],
      ['P1', { id: 'P1', kind: 'person', framesSeen: 40 } as TrackSummary],
      ['P2', { id: 'P2', kind: 'person', framesSeen: 40 } as TrackSummary],
      ['P3', { id: 'P3', kind: 'person', framesSeen: 2 } as TrackSummary],
    ]);
    const links = sharkToPersonLinks(drawn, tracks);
    expect(links).toHaveLength(1);
    expect(links[0]!.person.object.trackId).toBe('P2');
    expect(links[0]!.distancePx).toBe(30);
    expect(labelFor({ verdict: 'shark', length: { meters: 1.84 } } as TrackSummary, 'animal')).toBe('SHARK 1.8 m');
  });
});

describe('session reducer', () => {
  it('never moves a track back from a verdict to "verifying"', () => {
    const base = { sessionId: 's', t: 0 } as const;
    const track = (verdict: TrackSummary['verdict'], lastFrame: number) =>
      ({ id: 'T1', kind: 'animal', lifecycle: 'active', verdict, concepts: ['shark'], firstFrame: 0, lastFrame, framesSeen: lastFrame, verification: verdict === 'shark' ? { is_shark: true, label: 'shark', confidence: 0.9, species_guess: 'nurse shark', species_confidence: 'medium', behavior: '', evidence: [], latencyMs: 0 } : undefined }) as TrackSummary;
    let state = sessionReducer(initialSession, { type: 'connecting', sessionId: 's' });
    state = sessionReducer(state, { type: 'event', event: { ...base, seq: 0, type: 'track.updated', track: track('shark', 10) } });
    state = sessionReducer(state, { type: 'event', event: { ...base, seq: 1, type: 'track.updated', track: track('verifying', 30) } });
    expect(state.tracks.get('T1')).toMatchObject({ verdict: 'shark', lastFrame: 30 });
    expect(state.tracks.get('T1')!.verification?.species_guess).toBe('nurse shark');
  });
});

describe('session reducer alerts', () => {
  it('applies the newest alert version from either stream and logs acknowledgements after the patrol ended', () => {
    const alert = {
      id: 'A1', version: 1, sessionId: 's', clipId: 'c', level: 'warning', msgType: 'Alert', headline: 'h', summary: '', recommendation: '',
      beachAction: 'warn_swimmers', risk: { level: 'warning', score: 4, reasons: [], recipients: ['lifeguards'], recommendation: '' }, sharkCount: 1,
      trackIds: ['T1'], location: { lat: 0, lon: 0, name: 'x' }, drafter: 'template',
      recipients: [{ role: 'lifeguards', name: 'Lifeguard Dispatch (simulated)', channels: ['console'], message: 'm', status: 'delivered' }],
      status: 'sent', createdAt: '', sessionT: 1,
    } as const;
    let state = sessionReducer(initialSession, { type: 'connecting', sessionId: 's' });
    state = sessionReducer(state, { type: 'event', event: { sessionId: 's', seq: 0, t: 12, type: 'alert.updated', alert: structuredClone(alert) as never } });
    state = sessionReducer(state, { type: 'event', event: { sessionId: 's', seq: 1, t: 17, type: 'session.ended', reason: 'completed', costUsd: 0 } });
    const acked = { ...structuredClone(alert), version: 2, status: 'acknowledged', recipients: [{ ...alert.recipients[0], status: 'acknowledged', acknowledgedBy: 'Tower 3' }] };
    state = sessionReducer(state, { type: 'alert', alert: acked as never });
    expect(state.alerts.get('A1')!.status).toBe('acknowledged');
    expect(state.log.at(-1)!.text).toBe('Lifeguard Dispatch acknowledged A1 (Tower 3)');
    // A stale copy (version 1) arriving late changes nothing.
    const stale = sessionReducer(state, { type: 'alert', alert: structuredClone(alert) as never });
    expect(stale).toBe(state);
    // Alerts for other sessions are ignored.
    expect(sessionReducer(state, { type: 'alert', alert: { ...acked, version: 9, sessionId: 'other' } as never })).toBe(state);
  });
});

describe('session reducer over a real recorded stream', () => {
  it('reconstructs frames, tracks and a readable log', async () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'clips', 'clip-b-swimmer', 'manifest.json'), 'utf8')) as ClipManifest;
    const verifier: TrackVerifier = {
      async verify(request: VerifyBatchRequest): Promise<BatchOutcome> {
        return {
          outcomes: new Map(
            request.candidates.map((c, i) => [
              c.trackId,
              {
                verdict: i % 5 === 4 ? ('not_shark' as const) : ('shark' as const),
                verification: { is_shark: i % 5 !== 4, label: i % 5 === 4 ? 'ray' : 'shark', confidence: 0.9, species_guess: i % 5 === 4 ? '' : 'nurse shark', species_confidence: 'medium' as const, behavior: '', evidence: [], latencyMs: 0 },
                evidenceFile: `${c.trackId}.jpg`,
              },
            ]),
          ),
        };
      },
    };
    const bus = new EventBus('s1');
    await runSession({ manifest, bus, sam: new RecordedSamSource(join(import.meta.dirname, 'fixtures', 'sessions', 'clip-b-swimmer')), verifier, sessionDir: join(import.meta.dirname, '..', 'data', '.cache', 'test-evidence'), realtime: false });

    let state: SessionState = sessionReducer(initialSession, { type: 'connecting', sessionId: 's1' });
    for (const event of bus.history as SessionEvent[]) state = sessionReducer(state, { type: 'event', event });

    expect(state.status).toBe('ended');
    expect(state.frames.size).toBe(manifest.frameCount);
    expect(state.horizonFrame).toBe(manifest.frameCount - 1);
    expect(state.started?.clipId).toBe('clip-b-swimmer');
    expect(state.log.some((l) => l.level === 'alert' && l.text.includes('confirmed: likely nurse shark'))).toBe(true);
    expect(state.log.some((l) => l.text.includes('ruled out: ray'))).toBe(true);

    const shown = visibleTracks(state);
    expect(shown[0]!.verdict).toBe('shark');
    expect(shown.every((t) => t.verdict !== 'too_small' && t.lifecycle === 'active')).toBe(true);
    // People sort last; sharks first, nearest to a swimmer first.
    const kinds = shown.map((t) => t.kind);
    expect(kinds.lastIndexOf('animal')).toBeLessThan(kinds.indexOf('person'));

    // Contacts that left the frame stay on the record once Muse Spark ruled on them; candidates that
    // flickered and vanished are dropped.
    const departed = departedTracks(state);
    expect(departed.length).toBeGreaterThan(0);
    expect(departed.every((t) => t.lifecycle === 'lost' && t.kind === 'animal' && ['shark', 'uncertain', 'not_shark'].includes(t.verdict!))).toBe(true);
    expect([...state.tracks.values()].some((t) => t.lifecycle === 'lost' && !departed.includes(t))).toBe(true);

    // Events from another session are ignored.
    const foreign = { ...bus.history[1]!, sessionId: 'other' } as SessionEvent;
    expect(sessionReducer(state, { type: 'event', event: foreign })).toBe(state);
  }, 120_000);
});
