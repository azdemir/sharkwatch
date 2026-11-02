// Shared helpers for the Day-0 spike scripts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMaskToRaster, decodeMaskToSVGPath } from '@meta-sam/parser';
import sharp, { type OverlayOptions } from 'sharp';
import type { ClipManifest } from '../../src/shared/manifest.ts';
import type { SamDetection } from '../../src/server/meta/sam.ts';

export const root = process.cwd();

export function loadManifest(clipId: string): ClipManifest {
  return JSON.parse(readFileSync(join(root, 'data', 'clips', clipId, 'manifest.json'), 'utf8')) as ClipManifest;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2', '#ff9f0a'];

/**
 * Draws each detection three ways so the coordinate frames can be checked by eye:
 * box (stroke), decoded raster placed on its bounds (cyan fill), and the SVG path (dashed outline).
 * If the cyan fill and the dashed outline disagree, the path's coordinate space differs from the raster's.
 */
export async function renderOverlay(framePng: Buffer, detections: SamDetection[]): Promise<Buffer> {
  const meta = await sharp(framePng).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const layers: OverlayOptions[] = [];
  let svg = '';

  for (const [i, d] of detections.entries()) {
    const color = COLORS[i % COLORS.length];
    const { left, top, right, bottom } = d.box;
    svg += `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="none" stroke="${color}" stroke-width="2"/>`;
    const label = `#${d.objectId}${d.confidence === undefined ? '' : ` ${d.confidence.toFixed(2)}`}`;
    svg += `<text x="${left}" y="${Math.max(14, top - 4)}" fill="${color}" font-size="14" font-family="sans-serif">${label}</text>`;

    if (d.mask && d.maskBounds) {
      const b = d.maskBounds;
      const boxW = Math.max(1, b.right - b.left);
      const boxH = Math.max(1, b.bottom - b.top);
      const raster = decodeMaskToRaster(d.mask);
      const rgba = Buffer.alloc(d.mask.width * d.mask.height * 4);
      for (let p = 0; p < raster.length; p++) {
        if (raster[p] === 1) rgba.set([0, 255, 255, 110], p * 4);
      }
      if (b.left >= 0 && b.top >= 0 && b.left + boxW <= width && b.top + boxH <= height) {
        const fill = await sharp(rgba, { raw: { width: d.mask.width, height: d.mask.height, channels: 4 } })
          .resize(boxW, boxH, { kernel: 'nearest', fit: 'fill' })
          .png()
          .toBuffer();
        layers.push({ input: fill, left: b.left, top: b.top });
      }
      const path = decodeMaskToSVGPath(d.mask);
      if (path) {
        svg += `<path d="${path}" transform="translate(${b.left} ${b.top}) scale(${boxW / d.mask.width} ${boxH / d.mask.height})" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>`;
      }
    }
  }

  layers.push({ input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`) });
  return sharp(framePng).composite(layers).png().toBuffer();
}

export async function toDataUrl(png: Buffer, maxSide = 768): Promise<string> {
  const jpeg = await sharp(png).resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}
