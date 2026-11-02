// Geometry of a SAM mask in source-pixel coordinates.

export interface PixelBounds {
  /** Half-open source-pixel box the raster covers (the parser's `bounds`). */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MaskGeometry {
  areaPx: number;
  centroid: { x: number; y: number };
  /** Extent along the principal axis, in source pixels. */
  majorAxisPx: number;
  minorAxisPx: number;
  /** Principal axis angle in image coordinates, degrees in [0, 180), 0 = +x, 90 = +y (down). */
  orientationDeg: number;
}

/**
 * The raster may be a few pixels off the box size (the docs example has a 59 px box with a 60 px
 * mask), so each raster cell is mapped to the centre of its share of the box rather than assumed 1:1.
 */
export function maskGeometry(
  raster: Uint8Array,
  rasterWidth: number,
  rasterHeight: number,
  bounds: PixelBounds,
): MaskGeometry | null {
  if (raster.length !== rasterWidth * rasterHeight) {
    throw new RangeError(`raster length ${raster.length} != ${rasterWidth}x${rasterHeight}`);
  }
  const sx = (bounds.right - bounds.left) / rasterWidth;
  const sy = (bounds.bottom - bounds.top) / rasterHeight;

  let n = 0;
  let sumX = 0;
  let sumY = 0;
  for (let row = 0; row < rasterHeight; row++) {
    for (let col = 0; col < rasterWidth; col++) {
      if (raster[row * rasterWidth + col] !== 1) continue;
      n++;
      sumX += bounds.left + (col + 0.5) * sx;
      sumY += bounds.top + (row + 0.5) * sy;
    }
  }
  if (n === 0) return null;
  const cx = sumX / n;
  const cy = sumY / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let row = 0; row < rasterHeight; row++) {
    for (let col = 0; col < rasterWidth; col++) {
      if (raster[row * rasterWidth + col] !== 1) continue;
      const dx = bounds.left + (col + 0.5) * sx - cx;
      const dy = bounds.top + (row + 0.5) * sy - cy;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let row = 0; row < rasterHeight; row++) {
    for (let col = 0; col < rasterWidth; col++) {
      if (raster[row * rasterWidth + col] !== 1) continue;
      const dx = bounds.left + (col + 0.5) * sx - cx;
      const dy = bounds.top + (row + 0.5) * sy - cy;
      const u = dx * ux + dy * uy;
      const v = -dx * uy + dy * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }

  // Cell centres span one cell less than the shape; add back one cell measured along each axis.
  const cellAlongU = Math.abs(ux) * sx + Math.abs(uy) * sy;
  const cellAlongV = Math.abs(uy) * sx + Math.abs(ux) * sy;

  return {
    areaPx: n * sx * sy,
    centroid: { x: cx, y: cy },
    majorAxisPx: maxU - minU + cellAlongU,
    minorAxisPx: maxV - minV + cellAlongV,
    orientationDeg: (((theta * 180) / Math.PI) % 180 + 180) % 180,
  };
}
