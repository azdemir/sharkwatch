// Moved from sharkwatch-vite/src/shared/geo/gsd.ts (verbatim).
// Ground sampling distance (GSD) and real-world length estimates.

export interface CameraModel {
  sensorWidthMm: number;
  focalLengthMm: number;
  imageWidthPx: number;
}

export type SizeClass = 'small' | 'medium' | 'large';

export interface LengthEstimate {
  meters: number;
  low: number;
  high: number;
  sizeClass: SizeClass;
}

export interface LengthErrorModel {
  gsdRelativeError: number;
  edgePx: number;
  hiddenTailAllowance: number;
}

export const DEFAULT_LENGTH_ERROR: LengthErrorModel = {
  gsdRelativeError: 0.2,
  edgePx: 2,
  hiddenTailAllowance: 0.15,
};

export const REFERENCE_CAMERA = { sensorLongSideMm: 9.6, focalLengthMm: 6.7 } as const;

export function altitudeForGsd(gsd: number, longSidePx: number): number {
  return (gsd * REFERENCE_CAMERA.focalLengthMm * longSidePx) / REFERENCE_CAMERA.sensorLongSideMm;
}

export function groundSampleDistance(altitudeM: number, camera: CameraModel): number {
  if (altitudeM <= 0 || camera.focalLengthMm <= 0 || camera.imageWidthPx <= 0) {
    throw new RangeError('altitude, focal length and image width must be positive');
  }
  return (altitudeM * camera.sensorWidthMm) / (camera.focalLengthMm * camera.imageWidthPx);
}

export function gsdFromReference(knownLengthM: number, measuredPx: number): number {
  if (knownLengthM <= 0 || measuredPx <= 0) {
    throw new RangeError('reference length and measured pixels must be positive');
  }
  return knownLengthM / measuredPx;
}

export function rescaleGsd(gsd: number, fromWidthPx: number, toWidthPx: number): number {
  return (gsd * fromWidthPx) / toWidthPx;
}

export function sizeClassOf(meters: number): SizeClass {
  if (meters < 1.5) return 'small';
  if (meters <= 3) return 'medium';
  return 'large';
}

export function estimateLength(
  majorAxisPx: number,
  gsd: number,
  error: LengthErrorModel = DEFAULT_LENGTH_ERROR,
): LengthEstimate {
  const meters = majorAxisPx * gsd;
  const lowPx = Math.max(0, majorAxisPx - 2 * error.edgePx);
  const highPx = majorAxisPx + 2 * error.edgePx;
  return {
    meters,
    low: lowPx * gsd * (1 - error.gsdRelativeError),
    high: highPx * gsd * (1 + error.gsdRelativeError) * (1 + error.hiddenTailAllowance),
    sizeClass: sizeClassOf(meters),
  };
}
