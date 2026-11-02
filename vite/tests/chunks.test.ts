import { describe, expect, it } from 'vitest';
import { chunkPlan } from '../src/server/media/chunks.ts';

describe('chunkPlan', () => {
  it('covers every frame with overlapping windows', () => {
    for (const frameCount of [46, 60, 68, 120, 161, 176, 451]) {
      const plan = chunkPlan(frameCount, 60, 50);
      const covered = new Set(plan.flatMap((c) => Array.from({ length: c.frameCount }, (_, i) => c.startFrame + i)));
      expect(covered.size).toBe(frameCount);
      for (let i = 1; i < plan.length; i++) {
        expect(plan[i]!.startFrame).toBeLessThan(plan[i - 1]!.startFrame + plan[i - 1]!.frameCount);
      }
    }
  });

  it('re-anchors a short tail chunk to end on the last frame', () => {
    expect(chunkPlan(120, 60, 50).map((c) => [c.startFrame, c.frameCount])).toEqual([
      [0, 60],
      [50, 60],
      [60, 60],
    ]);
  });

  it('returns one short chunk for a clip shorter than a chunk', () => {
    expect(chunkPlan(46, 60, 50)).toEqual([{ index: 0, startFrame: 0, frameCount: 46 }]);
  });

  it('rejects non-overlapping windows', () => {
    expect(() => chunkPlan(100, 50, 50)).toThrow(RangeError);
  });
});
