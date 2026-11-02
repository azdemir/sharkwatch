// Geometry for the drawn chart: land and shoal areas from each clip's coastline, the nearest shore
// point and the framing. Pure, so every clip's chart is unit-tested (see tests/chart.test.ts).

import { distanceMeters, offsetGeo, toLocal, type GeoPoint, type LocalPoint } from '../../shared/geo/project.ts';

/** Width of the shallow-water band drawn along every coast (charts shade shoal water blue). */
export const SHOAL_WIDTH_M = 45;

export interface ChartArea {
  /** The coastline as drawn (open coasts are carried on past the edge of the view). */
  coast: GeoPoint[];
  land: GeoPoint[];
  shoal: GeoPoint[];
  island: boolean;
}

const unit = (v: LocalPoint): LocalPoint => {
  const len = Math.hypot(v.east, v.north) || 1;
  return { east: v.east / len, north: v.north / len };
};

export function isClosedRing(line: GeoPoint[]): boolean {
  return line.length > 3 && distanceMeters(line[0]!, line.at(-1)!) < 2;
}

/** The closest point on a polyline to `p`, with its distance and the segment it lies on. */
export function nearestOnLine(p: GeoPoint, line: GeoPoint[]): { point: GeoPoint; distanceM: number; segment: number } {
  let best = { point: line[0]!, distanceM: distanceMeters(p, line[0]!), segment: 0 };
  for (let i = 0; i + 1 < line.length; i++) {
    const a = toLocal(p, line[i]!);
    const b = toLocal(p, line[i + 1]!);
    const dx = b.east - a.east;
    const dy = b.north - a.north;
    const len2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, -(a.east * dx + a.north * dy) / len2));
    const q = { east: a.east + k * dx, north: a.north + k * dy };
    const d = Math.hypot(q.east, q.north);
    if (d < best.distanceM) best = { point: offsetGeo(p, q), distanceM: d, segment: i };
  }
  return best;
}

/**
 * An open coastline (a beach): land lies on the side of the coast's nearest segment that faces
 * away from the patrol, which is at sea. Deciding from the nearest segment rather than the line's
 * overall direction keeps it right on curving coasts and bays. The coast is carried on `reachM`
 * past both ends so land never stops inside the view.
 */
function openCoast(shore: GeoPoint[], sea: GeoPoint, reachM: number): ChartArea {
  const near = nearestOnLine(sea, shore);
  const a = shore[near.segment]!;
  const b = shore[near.segment + 1] ?? a;
  const along = unit(toLocal(a, b));
  let inland = { east: -along.north, north: along.east };
  const toSea = toLocal(near.point, sea);
  if (inland.east * toSea.east + inland.north * toSea.north > 0) inland = { east: -inland.east, north: -inland.north };

  const extend = (from: GeoPoint, to: GeoPoint) => {
    const d = unit(toLocal(to, from));
    return offsetGeo(from, { east: d.east * reachM, north: d.north * reachM });
  };
  const line = [extend(shore[0]!, shore[1]!), ...shore, extend(shore.at(-1)!, shore.at(-2)!)];
  const shift = (p: GeoPoint, m: number) => offsetGeo(p, { east: inland.east * m, north: inland.north * m });
  return {
    coast: line,
    land: [...line, shift(line.at(-1)!, reachM), shift(line[0]!, reachM)],
    shoal: [...line, ...[...line].reverse().map((p) => shift(p, -SHOAL_WIDTH_M))],
    island: false,
  };
}

/** An island (a closed ring): the ring is the land; the shoal band rings it on the outside. */
function islandArea(ring: GeoPoint[]): ChartArea {
  const origin = ring[0]!;
  const local = ring.map((p) => toLocal(origin, p));
  // Signed area tells which way the ring winds, so "outside" is known for every vertex.
  let area = 0;
  for (let i = 0; i + 1 < local.length; i++) area += local[i]!.east * local[i + 1]!.north - local[i + 1]!.east * local[i]!.north;
  const sign = area > 0 ? 1 : -1;
  const n = local.length - 1;
  const shoal = local.slice(0, n).map((p, i) => {
    const prev = local[(i - 1 + n) % n]!;
    const next = local[(i + 1) % n]!;
    const e1 = unit({ east: p.east - prev.east, north: p.north - prev.north });
    const e2 = unit({ east: next.east - p.east, north: next.north - p.north });
    const normal = unit({ east: (e1.north + e2.north) * sign, north: -(e1.east + e2.east) * sign });
    return offsetGeo(origin, { east: p.east + normal.east * SHOAL_WIDTH_M, north: p.north + normal.north * SHOAL_WIDTH_M });
  });
  return { coast: ring, land: ring, shoal, island: true };
}

/** Chart areas for one coastline, open or closed. */
export function coastArea(shore: GeoPoint[], sea: GeoPoint, reachM: number): ChartArea | undefined {
  if (shore.length < 2) return undefined;
  return isClosedRing(shore) ? islandArea(shore) : openCoast(shore, sea, reachM);
}

/** The point on any coastline nearest the patrol, and how far it is. */
export function nearestCoast(coasts: GeoPoint[][], center: GeoPoint): { point: GeoPoint; distanceM: number } | undefined {
  let best: { point: GeoPoint; distanceM: number } | undefined;
  for (const c of coasts) {
    if (c.length < 2) continue;
    const n = nearestOnLine(center, c);
    if (!best || n.distanceM < best.distanceM) best = n;
  }
  return best;
}

/**
 * Framing that keeps the patrol in the middle with the nearest coast in view: that coast point and
 * its mirror image through the patrol centre. Offshore clips zoom out as far as the coast is.
 */
export function coastFraming(coasts: GeoPoint[][], center: GeoPoint): GeoPoint[] {
  const near = nearestCoast(coasts, center);
  if (!near || near.distanceM > 60_000) return [];
  return [near.point, { lat: 2 * center.lat - near.point.lat, lon: 2 * center.lon - near.point.lon }];
}

/** Distances as a chart letters them: metres near the beach, kilometres offshore. */
export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return m < 10 ? `${m.toFixed(1)} m` : `${m.toFixed(0)} m`;
}
