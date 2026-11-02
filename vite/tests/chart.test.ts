import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SessionEvent } from '../src/shared/events.ts';
import { pixelToGeo, type CameraPose, type GeoPoint } from '../src/shared/geo/project.ts';
import { insidePolygon } from '../src/shared/geo/shore.ts';
import type { ClipManifest } from '../src/shared/manifest.ts';
import { coastArea, coastFraming, formatDistance, nearestCoast } from '../src/web/lib/chart.ts';

const ROOT = join(import.meta.dirname, '..', 'data');
const clips = readdirSync(join(ROOT, 'clips')).map((id) => JSON.parse(readFileSync(join(ROOT, 'clips', id, 'manifest.json'), 'utf8')) as ClipManifest);

function chartOf(m: ClipManifest) {
  const s = m.scene!;
  const pose: CameraPose = { center: s.center, headingDeg: s.headingDeg, gsd: s.gsd, imageWidthPx: m.width, imageHeightPx: m.height };
  const toGeo = ([x, y]: [number, number]) => pixelToGeo(x, y, pose);
  const coasts = [s.shorelinePx.map(toGeo), ...(s.chartCoastPx ?? []).map((c) => c.map(toGeo))].filter((c) => c.length > 1);
  const reach = Math.max(3000, 4 * (nearestCoast(coasts, s.center)?.distanceM ?? 0));
  return { coasts, areas: coasts.map((c) => coastArea(c, s.center, reach)!).filter(Boolean) };
}

function recordedSharks(clipId: string): GeoPoint[] {
  const events = readFileSync(join(ROOT, 'sessions', 'golden', clipId, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as SessionEvent);
  const out: GeoPoint[] = [];
  for (const e of events) if (e.type === 'track.updated' && e.track.kind === 'animal' && e.track.verdict === 'shark' && e.track.position) out.push(e.track.position);
  return out;
}

describe('drawn chart, for every clip', () => {
  for (const m of clips.filter((c) => c.scene)) {
    it(`${m.id}: the drone and every recorded shark are at sea, and the coast is in frame`, () => {
      const { coasts, areas } = chartOf(m);
      expect(areas.length, 'every clip carries a coastline to draw').toBeGreaterThan(0);
      expect(coastFraming(coasts, m.scene!.center), 'the chart frames the nearest coast').toHaveLength(2);
      for (const a of areas) {
        expect(insidePolygon(m.scene!.center, a.land), 'drone over land').toBe(false);
        for (const p of recordedSharks(m.id)) expect(insidePolygon(p, a.land), `shark at ${p.lat},${p.lon} drawn on land`).toBe(false);
      }
    });
  }

  it('letters distances in metres near the beach and kilometres offshore', () => {
    expect(formatDistance(4.26)).toBe('4.3 m');
    expect(formatDistance(148.4)).toBe('148 m');
    expect(formatDistance(8625)).toBe('8.6 km');
  });
});
