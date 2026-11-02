// Distance to the shoreline and whether a track is closing on it.

import { toLocal, type GeoPoint, type LocalPoint } from './project.ts';

function distanceToSegment(p: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const abE = b.east - a.east;
  const abN = b.north - a.north;
  const lenSq = abE * abE + abN * abN;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.east - a.east) * abE + (p.north - a.north) * abN) / lenSq));
  return Math.hypot(p.east - (a.east + t * abE), p.north - (a.north + t * abN));
}

export function distanceToPolyline(point: GeoPoint, line: GeoPoint[]): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY;
  const local = line.map((v) => toLocal(point, v));
  const origin = { east: 0, north: 0 };
  if (local.length === 1) return Math.hypot(local[0]!.east, local[0]!.north);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < local.length - 1; i++) {
    best = Math.min(best, distanceToSegment(origin, local[i]!, local[i + 1]!));
  }
  return best;
}

/** Ray casting on a local projection; adequate for beach-scale swim-zone polygons. */
export function insidePolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  const pts = polygon.map((v) => toLocal(point, v));
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.north > 0 !== b.north > 0 && 0 < ((b.east - a.east) * (0 - a.north)) / (b.north - a.north) + a.east) {
      inside = !inside;
    }
  }
  return inside;
}

/** Metres per second toward the shore (positive = approaching), from timed distance samples. */
export function shoreApproachRate(samples: { t: number; distanceM: number }[]): number | null {
  if (samples.length < 2) return null;
  const first = samples[0]!;
  const last = samples.at(-1)!;
  const dt = last.t - first.t;
  if (dt <= 0) return null;
  return (first.distanceM - last.distanceM) / dt;
}
