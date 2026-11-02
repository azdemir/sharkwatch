import { decodeMaskToRaster } from '@meta-sam/parser';
import { describe, expect, it } from 'vitest';
import { detectionsFrom, parseRawOutput } from '../src/server/meta/sam.ts';
import { maskGeometry } from '../src/server/pipeline/metrics.ts';

// Mask payloads copied from the documented SAM 3.1 video example
// (https://dev.meta.ai/docs/sam/reading-segmentation): 27×60 and 27×48 lossless masks.
const MASK_A = "27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(";
const MASK_B = '27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@';

const box = (x1: number, y1: number, x2: number, y2: number, c?: number) =>
  `<|box;x1=${x1};y1=${y1};x2=${x2};y2=${y2};w=320;h=334${c === undefined ? '' : `;c=${c}`}|>`;
const mask = (data: string, c?: number) => `<|mask;x=0;y=0${c === undefined ? '' : `;c=${c}`};data=${data}|>`;

describe('SAM output parsing', () => {
  it('parses the documented example: inclusive corners become a half-open box matching the raster', async () => {
    const raw = `<0f>0${box(211, 228, 270, 254)}${mask(MASK_A)},1${box(155, 228, 202, 254)}${mask(MASK_B)}\n`;
    const result = await parseRawOutput(raw);
    expect(result.outcome.status).toBe('completed');
    expect(result.diagnostics).toHaveLength(0);

    const [a, b] = detectionsFrom(result);
    expect(a!.objectId).toBe('0');
    expect(a!.box).toEqual({ left: 211, top: 228, right: 271, bottom: 255 });
    expect(a!.maskBounds).toEqual(a!.box);
    expect(a!.mask).toMatchObject({ width: 60, height: 27, encoding: 'lossless' });
    expect(b!.mask).toMatchObject({ width: 48, height: 27 });

    const raster = decodeMaskToRaster(a!.mask!);
    expect(raster).toHaveLength(60 * 27);
    const geometry = maskGeometry(raster, 60, 27, a!.maskBounds!)!;
    expect(geometry.centroid.x).toBeGreaterThan(211);
    expect(geometry.centroid.x).toBeLessThan(271);
    expect(geometry.majorAxisPx).toBeLessThanOrEqual(Math.hypot(60, 27) + 1);
  });

  it('keeps sparse ids, skipped frames and per-frame confidence', async () => {
    const raw = [
      `<0f>0${box(211, 228, 270, 254, 0.91)}${mask(MASK_A, 0.91)},2${box(155, 228, 202, 254, 0.62)}${mask(MASK_B, 0.62)}`,
      // Frame 1 is omitted: nothing visible.
      `<2f>2${box(157, 229, 204, 255, 0.58)}${mask(MASK_B, 0.58)}`,
      '',
    ].join('\n');
    const detections = detectionsFrom(await parseRawOutput(raw));
    expect(detections.map((d) => [d.frameIndex, d.objectId, d.confidence])).toEqual([
      [0, '0', 0.91],
      [0, '2', 0.62],
      [2, '2', 0.58],
    ]);
  });

  it('treats empty output as zero matches, not an error', async () => {
    const result = await parseRawOutput('');
    expect(result.outcome.status).toBe('completed');
    expect(detectionsFrom(result)).toHaveLength(0);
  });
});
