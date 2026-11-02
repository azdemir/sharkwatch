import { describe, expect, it } from 'vitest';
import { maskGeometry, type PixelBounds } from '../src/server/pipeline/metrics.ts';

interface Ellipse {
  cx: number;
  cy: number;
  a: number;
  b: number;
  angleDeg: number;
}

function insideEllipse(e: Ellipse, x: number, y: number): boolean {
  const t = (e.angleDeg * Math.PI) / 180;
  const dx = x - e.cx;
  const dy = y - e.cy;
  const u = dx * Math.cos(t) + dy * Math.sin(t);
  const v = -dx * Math.sin(t) + dy * Math.cos(t);
  return (u * u) / (e.a * e.a) + (v * v) / (e.b * e.b) <= 1;
}

function ellipseBounds(e: Ellipse): PixelBounds {
  const t = (e.angleDeg * Math.PI) / 180;
  const hw = Math.sqrt((e.a * Math.cos(t)) ** 2 + (e.b * Math.sin(t)) ** 2);
  const hh = Math.sqrt((e.a * Math.sin(t)) ** 2 + (e.b * Math.cos(t)) ** 2);
  return {
    left: Math.floor(e.cx - hw),
    top: Math.floor(e.cy - hh),
    right: Math.ceil(e.cx + hw),
    bottom: Math.ceil(e.cy + hh),
  };
}

/** Rasterizes the ellipse into a W×H grid stretched over `bounds`, sampling at cell centres. */
function rasterize(e: Ellipse, bounds: PixelBounds, width: number, height: number): Uint8Array {
  const sx = (bounds.right - bounds.left) / width;
  const sy = (bounds.bottom - bounds.top) / height;
  const raster = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const x = bounds.left + (col + 0.5) * sx;
      const y = bounds.top + (row + 0.5) * sy;
      raster[row * width + col] = insideEllipse(e, x, y) ? 1 : 0;
    }
  }
  return raster;
}

describe('maskGeometry', () => {
  const shark: Ellipse = { cx: 500.3, cy: 300.7, a: 60, b: 15, angleDeg: 30 };
  const bounds = ellipseBounds(shark);
  const boxW = bounds.right - bounds.left;
  const boxH = bounds.bottom - bounds.top;

  it('recovers length, width, orientation and centroid of a rotated body at full resolution', () => {
    const g = maskGeometry(rasterize(shark, bounds, boxW, boxH), boxW, boxH, bounds)!;
    expect(g.majorAxisPx).toBeGreaterThan(120 * 0.98);
    expect(g.majorAxisPx).toBeLessThan(120 * 1.02);
    expect(g.minorAxisPx).toBeGreaterThan(30 * 0.95);
    expect(g.minorAxisPx).toBeLessThan(30 * 1.05);
    expect(g.orientationDeg).toBeCloseTo(30, 0);
    expect(g.centroid.x).toBeCloseTo(shark.cx, 0);
    expect(g.centroid.y).toBeCloseTo(shark.cy, 0);
    expect(g.areaPx).toBeGreaterThan(Math.PI * 60 * 15 * 0.97);
    expect(g.areaPx).toBeLessThan(Math.PI * 60 * 15 * 1.03);
  });

  it('measures in source pixels when the raster is one cell wider than the box', () => {
    const g = maskGeometry(rasterize(shark, bounds, boxW + 1, boxH), boxW + 1, boxH, bounds)!;
    expect(g.majorAxisPx).toBeGreaterThan(120 * 0.98);
    expect(g.majorAxisPx).toBeLessThan(120 * 1.02);
  });

  it('measures in source pixels when the raster is downsampled', () => {
    const w = Math.round(boxW / 2);
    const h = Math.round(boxH / 2);
    const g = maskGeometry(rasterize(shark, bounds, w, h), w, h, bounds)!;
    expect(g.majorAxisPx).toBeGreaterThan(120 * 0.96);
    expect(g.majorAxisPx).toBeLessThan(120 * 1.04);
  });

  it('handles a body pointing straight down the frame', () => {
    const vertical: Ellipse = { cx: 200, cy: 200, a: 40, b: 8, angleDeg: 90 };
    const vb = ellipseBounds(vertical);
    const w = vb.right - vb.left;
    const h = vb.bottom - vb.top;
    const g = maskGeometry(rasterize(vertical, vb, w, h), w, h, vb)!;
    expect(g.majorAxisPx).toBeGreaterThan(80 * 0.97);
    expect(g.majorAxisPx).toBeLessThan(80 * 1.03);
    expect(Math.min(g.orientationDeg, 180 - g.orientationDeg)).toBeGreaterThan(88);
  });

  it('returns null for an empty mask and rejects a mismatched raster', () => {
    expect(maskGeometry(new Uint8Array(12), 4, 3, { left: 0, top: 0, right: 4, bottom: 3 })).toBeNull();
    expect(() => maskGeometry(new Uint8Array(11), 4, 3, { left: 0, top: 0, right: 4, bottom: 3 })).toThrow(RangeError);
  });
});
