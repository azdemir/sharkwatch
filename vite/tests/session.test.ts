import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { SessionEvent } from '../src/shared/events.ts';
import type { ClipManifest } from '../src/shared/manifest.ts';
import { EventBus, recordTo } from '../src/server/events/bus.ts';
import { RecordedSamSource } from '../src/server/pipeline/sam-source.ts';
import { runSession } from '../src/server/pipeline/session.ts';
import type { BatchOutcome, TrackVerifier, VerifyBatchRequest } from '../src/server/pipeline/verifier.ts';

// End-to-end over real SAM output recorded from a live run of clip b (sharks around two swimmers),
// with a stub verifier, so the whole pipeline is covered without any API calls.
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'clips', 'clip-b-swimmer', 'manifest.json'), 'utf8')) as ClipManifest;
const rawDir = join(import.meta.dirname, 'fixtures', 'sessions', 'clip-b-swimmer');

class StubVerifier implements TrackVerifier {
  readonly batches: string[][] = [];
  async verify(request: VerifyBatchRequest): Promise<BatchOutcome> {
    this.batches.push(request.candidates.map((c) => c.trackId));
    const outcomes = new Map(
      request.candidates.map((c) => [
        c.trackId,
        {
          verdict: 'shark' as const,
          verification: { is_shark: true, label: 'shark', confidence: 0.9, species_guess: 'nurse shark', species_confidence: 'medium' as const, behavior: '', evidence: [], latencyMs: 0 },
          evidenceFile: `${c.trackId}.jpg`,
        },
      ]),
    );
    return { outcomes };
  }
}

describe('runSession on recorded SAM output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sharkwatch-session-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('emits every frame once, tracks people and sharks, and verifies in one batch per chunk', async () => {
    const bus = new EventBus('test');
    recordTo(bus, join(dir, 'events.jsonl'));
    const verifier = new StubVerifier();
    const result = await runSession({ manifest, bus, sam: new RecordedSamSource(rawDir), verifier, sessionDir: dir, realtime: false });

    expect(result.reason).toBe('completed');
    const events = bus.history;
    expect(events[0]!.type).toBe('session.started');
    expect(events.at(-1)!.type).toBe('session.ended');

    const frames = events.flatMap((e) => (e.type === 'frames' ? e.frames.map((f) => f.frame) : []));
    expect(frames).toEqual([...Array(manifest.frameCount).keys()]);

    const people = result.tracks.filter((t) => t.kind === 'person' && t.framesSeen > 100);
    expect(people).toHaveLength(2);
    const sharks = result.tracks.filter((t) => t.verdict === 'shark');
    expect(sharks.length).toBeGreaterThanOrEqual(12);
    // Each chunk's newly confirmed animals go out together, not one call per track.
    expect(verifier.batches.length).toBeLessThanOrEqual(manifest.chunks.length);
    // Small fish caught by the generic prompt are not sent for verification.
    expect(result.tracks.some((t) => t.verdict === 'too_small')).toBe(true);
    for (const shark of sharks) {
      expect(shark.position).toBeDefined();
      expect(shark.length!.meters).toBeGreaterThan(0.5);
      expect(shark.nearestPersonM).toBeLessThan(10);
    }
    // The recording is the same stream, line for line.
    const recorded = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as SessionEvent);
    expect(recorded.map((e) => e.seq)).toEqual(events.map((e) => e.seq));
    // A fresh checkout builds the clip's chunks first, which takes a few seconds.
  }, 120_000);
});
