// Mask outlines from SAM trace every pixel step (hundreds of points per animal). For display a
// one-pixel tolerance is invisible and cuts the path to a few dozen points, which keeps recordings
// and live streams roughly ten times smaller.

type Point = [number, number];

/** Parses an M/L/Z polygon path (what decodeMaskToSVGPath emits) into closed rings. */
export function parsePolygonPath(d: string): Point[][] {
  const rings: Point[][] = [];
  let ring: Point[] = [];
  const tokens = d.match(/[MLZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === 'M' || t === 'm') {
      if (ring.length) rings.push(ring);
      ring = [[Number(tokens[++i]), Number(tokens[++i])]];
    } else if (t === 'L' || t === 'l') {
      ring.push([Number(tokens[++i]), Number(tokens[++i])]);
    } else if (t === 'Z' || t === 'z') {
      if (ring.length) rings.push(ring);
      ring = [];
    } else {
      // Implicit lineto after the first pair.
      ring.push([Number(t), Number(tokens[++i])]);
    }
  }
  if (ring.length) rings.push(ring);
  return rings;
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/** Ramer–Douglas–Peucker on an open polyline (iterative, so long outlines can't overflow the stack). */
function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxD = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i]!, points[start]!, points[end]!);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index >= 0 && maxD > epsilon) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplifies a closed ring by splitting it at its farthest point from the start. */
function simplifyRing(ring: Point[], epsilon: number): Point[] {
  if (ring.length < 4) return ring;
  const first = ring[0]!;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i]![0] - first[0], ring[i]![1] - first[1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = rdp(ring.slice(0, far + 1), epsilon);
  const b = rdp([...ring.slice(far), first], epsilon);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

export function simplifyMaskPath(d: string, epsilon = 1): string {
  return parsePolygonPath(d)
    .map((ring) => simplifyRing(ring, epsilon))
    .filter((ring) => ring.length >= 3)
    .map((ring) => `M${ring.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`)
    .join('');
}

/** Shoelace area of all rings (holes subtract if wound the other way). */
export function pathArea(d: string): number {
  let total = 0;
  for (const ring of parsePolygonPath(d)) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[(i + 1) % ring.length]!;
      a += x1 * y2 - x2 * y1;
    }
    total += a / 2;
  }
  return Math.abs(total);
}
