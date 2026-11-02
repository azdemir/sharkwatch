import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeMaskToSVGPath } from '@meta-sam/parser';
import { parsePolygonPath, pathArea, simplifyMaskPath } from '../src/shared/maskPath.ts';
import { detectionsFrom, parseRawOutput } from '../src/server/meta/sam.ts';

describe('mask path simplification', () => {
  it('keeps a rectangle traced pixel by pixel as four corners', () => {
    const steps: string[] = [];
    for (let x = 0; x <= 40; x++) steps.push(`${x} 0`);
    for (let y = 1; y <= 20; y++) steps.push(`40 ${y}`);
    for (let x = 39; x >= 0; x--) steps.push(`${x} 20`);
    for (let y = 19; y >= 1; y--) steps.push(`0 ${y}`);
    const d = `M${steps.join('L')}Z`;
    const simple = simplifyMaskPath(d);
    expect(parsePolygonPath(simple)[0]).toHaveLength(4);
    expect(pathArea(simple)).toBeCloseTo(800, 6);
  });

  it('shrinks real SAM outlines at least fivefold while keeping their area within 3%', async () => {
    const raw = readFileSync(join(import.meta.dirname, 'fixtures', 'sam', 'clip-b-swimmer-c0-shark.txt'), 'utf8');
    const paths = detectionsFrom(await parseRawOutput(raw)).flatMap((d) => (d.mask ? [decodeMaskToSVGPath(d.mask)] : []));
    expect(paths.length).toBeGreaterThan(10);
    let before = 0;
    let after = 0;
    for (const p of paths) {
      const s = simplifyMaskPath(p);
      before += p.length;
      after += s.length;
      const a0 = pathArea(p);
      if (a0 > 200) expect(Math.abs(pathArea(s) - a0) / a0).toBeLessThan(0.03);
    }
    expect(after).toBeLessThan(before / 5);
  });

  it('is idempotent enough to re-run on already simplified paths', () => {
    const d = 'M0 0L10 0L10 10L0 10Z';
    expect(simplifyMaskPath(simplifyMaskPath(d))).toBe(simplifyMaskPath(d));
  });
});
