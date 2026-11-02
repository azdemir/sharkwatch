import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SessionEvent } from '../src/shared/events.ts';
import { replaySchedule } from '../src/server/sessions.ts';

// The curated recordings are what a keyless clone shows in Replay mode; keep them valid.
const GOLDEN = join(import.meta.dirname, '..', 'data', 'sessions', 'golden');
const recordings = existsSync(GOLDEN) ? readdirSync(GOLDEN).filter((d) => existsSync(join(GOLDEN, d, 'events.jsonl'))) : [];

describe('golden recordings', () => {
  it('ship with the repo', () => {
    expect(recordings.length).toBeGreaterThanOrEqual(3);
  });

  for (const name of recordings) {
    it(`${name} is complete, matches its clip, and has its evidence images`, () => {
      const dir = join(GOLDEN, name);
      const events = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as SessionEvent);
      const started = events[0]!;
      expect(started.type).toBe('session.started');
      if (started.type !== 'session.started') return;
      expect(existsSync(join(GOLDEN, '..', '..', 'clips', started.clipId, 'manifest.json'))).toBe(true);
      expect(events.at(-1)).toMatchObject({ type: 'session.ended', reason: 'completed' });

      const frames = new Set(events.flatMap((e) => (e.type === 'frames' ? e.frames.map((f) => f.frame) : [])));
      expect(frames.size).toBe(started.frameCount);

      for (const e of events) {
        if (e.type === 'track.updated' && e.track.evidence) expect(existsSync(join(dir, e.track.evidence)), e.track.evidence).toBe(true);
      }
      // Replays end with the footage, plus at most a last verdict's short delay, and end last.
      const schedule = replaySchedule(events, started.fps);
      const duration = started.frameCount / started.fps;
      expect(schedule.at(-1)!.event.type).toBe('session.ended');
      expect(schedule.at(-1)!.atS).toBeGreaterThanOrEqual(duration - 1e-9);
      expect(schedule.at(-1)!.atS).toBeLessThanOrEqual(duration + 2);
      // Every verdict rests on footage already shown, and current recordings say which frame.
      for (const { event, atS } of schedule) {
        if (event.type !== 'track.updated' || !event.track.verification) continue;
        expect(event.track.verification.basedOnFrame, `${name} ${event.track.id}`).toBeDefined();
        expect(atS).toBeGreaterThanOrEqual((event.track.verification.basedOnFrame! + 1) / started.fps);
      }
    });
  }
});
