import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { pixelateBoxes } from '../src/server/pipeline/evidence.ts';

/** A 120×80 frame of fine diagonal stripes: any pixelation shows up as lost detail. */
async function stripes(): Promise<Buffer> {
  const w = 120;
  const h = 80;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.fill((x + y) % 4 < 2 ? 255 : 0, (y * w + x) * 3, (y * w + x) * 3 + 3);
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

/** The red channel of every pixel, whatever the image's channel count (compositing adds alpha). */
async function reds(png: Buffer): Promise<number[]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return Array.from({ length: info.width * info.height }, (_, i) => data[i * info.channels]!);
}

describe('evidence privacy', () => {
  it('pixelates people and leaves the rest of the frame untouched', async () => {
    const frame = await stripes();
    const out = await reds(await pixelateBoxes(frame, [{ left: 40, top: 20, right: 70, bottom: 50 }], { width: 120, height: 80 }, 10));
    const before = await reds(frame);
    const at = (px: number[], x: number, y: number) => px[y * 120 + x]!;
    // Inside the box the stripes are gone: neighbouring pixels agree.
    let same = 0;
    for (let x = 42; x < 68; x++) if (at(out, x, 35) === at(out, x + 1, 35)) same++;
    expect(same).toBeGreaterThan(20);
    // Far from the box nothing changed.
    for (const [x, y] of [[5, 5], [110, 70], [100, 10]] as const) expect(at(out, x, y)).toBe(at(before, x, y));
  });

  it('returns the frame as it was when nobody is in it', async () => {
    const frame = await stripes();
    expect(await pixelateBoxes(frame, [], { width: 120, height: 80 })).toBe(frame);
  });
});
