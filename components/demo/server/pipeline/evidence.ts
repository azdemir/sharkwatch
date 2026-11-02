// Images shown to Muse Spark and attached to alerts.

import sharp from 'sharp';
import type { SamBox } from '../meta/sam.ts';

export interface FrameSize {
  width: number;
  height: number;
}

/** Square crop around a box with context (2× the box, at least 160 px), kept inside the frame. */
export async function cropAround(png: Buffer, box: SamBox, frame: FrameSize): Promise<Buffer> {
  const side = Math.min(
    Math.max(160, Math.round(Math.max(box.right - box.left, box.bottom - box.top) * 2)),
    frame.width,
    frame.height,
  );
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const left = Math.max(0, Math.min(frame.width - side, Math.round(cx - side / 2)));
  const top = Math.max(0, Math.min(frame.height - side, Math.round(cy - side / 2)));
  return sharp(png).extract({ left, top, width: side, height: side }).png().toBuffer();
}

/** The full frame with the object outlined, so the model knows which animal in a crowd is meant. */
export async function annotate(png: Buffer, box: SamBox, frame: FrameSize): Promise<Buffer> {
  const rect = `<rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" fill="none" stroke="#ff2d2d" stroke-width="3"/>`;
  return sharp(png)
    .composite([{ input: Buffer.from(`<svg width="${frame.width}" height="${frame.height}" xmlns="http://www.w3.org/2000/svg">${rect}</svg>`) }])
    .png()
    .toBuffer();
}

export async function toJpegDataUrl(png: Buffer, maxSide: number): Promise<string> {
  const jpeg = await sharp(png).resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

/**
 * Pixelates each box (with a margin) in a frame: evidence photos reach consoles and phones, so the
 * people in them are as unrecognisable as they are in the operator's feed.
 */
export async function pixelateBoxes(png: Buffer, boxes: SamBox[], frame: FrameSize, block = 12): Promise<Buffer> {
  if (!boxes.length) return png;
  const tiles = await Promise.all(
    boxes.map(async (b) => {
      const padX = (b.right - b.left) * 0.15;
      const padY = (b.bottom - b.top) * 0.15;
      const left = Math.max(0, Math.floor(b.left - padX));
      const top = Math.max(0, Math.floor(b.top - padY));
      const width = Math.min(frame.width - left, Math.ceil(b.right - b.left + 2 * padX));
      const height = Math.min(frame.height - top, Math.ceil(b.bottom - b.top + 2 * padY));
      if (width < 2 || height < 2) return undefined;
      const small = await sharp(png)
        .extract({ left, top, width, height })
        .resize(Math.max(1, Math.round(width / block)), Math.max(1, Math.round(height / block)), { kernel: 'nearest' })
        .png()
        .toBuffer();
      const input = await sharp(small).resize(width, height, { kernel: 'nearest' }).png().toBuffer();
      return { input, left, top };
    }),
  );
  return sharp(png).composite(tiles.filter((t) => t !== undefined)).png().toBuffer();
}

export async function saveJpeg(png: Buffer, path: string, maxSide: number): Promise<void> {
  await sharp(png).resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(path);
}
