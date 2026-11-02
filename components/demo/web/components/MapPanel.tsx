// A small nautical chart of the patrol, drawn from the real OpenStreetMap coastline each clip
// carries: buff land, white deep water, blue shoal along the shore (as charts shade shallow water),
// an ink coastline, and our marks on top. No map tiles, so it works offline and shows no shops,
// car parks or road names. The geometry lives in lib/chart.ts, where every clip's chart is tested.

import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Polygon, Polyline, ScaleControl, Tooltip, useMap } from 'react-leaflet';
import type { ClipInfo } from '../../shared/api.ts';
import type { TrackSummary } from '../../shared/events.ts';
import { footprint, offsetGeo, pixelToGeo, type CameraPose, type GeoPoint } from '../../shared/geo/project.ts';
import { coastArea, coastFraming, formatDistance, nearestCoast, nearestOnLine } from '../lib/chart.ts';
import { TONE_COLORS, toneFor } from '../lib/overlay.ts';

const ll = (p: GeoPoint): [number, number] => [p.lat, p.lon];
const INK = '#14212a';
const LAND = '#ead9a8';
const SHOAL = '#cfe3ec';
const MAGENTA = '#b4246e';

function FitTo({ bounds }: { bounds: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds.length) return;
    // Street-level context: a drone frame is only 5–100 m across, so don't zoom past the beach.
    const fit = () => {
      map.invalidateSize({ animate: false });
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 18, animate: false });
    };
    fit();
    // The panel changes height as the beach status above it grows (an alert arriving), which Leaflet
    // doesn't notice by itself: refit so the patrol stays in the middle of the chart.
    const resized = new ResizeObserver(fit);
    resized.observe(map.getContainer());
    return () => resized.disconnect();
  }, [map, bounds]);
  return null;
}

export function MapPanel({
  clip,
  tracks,
  departed = [],
  selectedId,
  onSelect,
}: {
  clip: ClipInfo;
  tracks: TrackSummary[];
  /** Contacts that left the frame, drawn faded at their last known position. */
  departed?: TrackSummary[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const scene = clip.scene;
  const geometry = useMemo(() => {
    if (!scene) return undefined;
    const pose: CameraPose = { center: scene.center, headingDeg: scene.headingDeg, gsd: scene.gsd, imageWidthPx: clip.width, imageHeightPx: clip.height };
    const toGeo = ([x, y]: [number, number]) => pixelToGeo(x, y, pose);
    const camera = footprint(pose).map(ll);
    const shore = scene.shorelinePx.map(toGeo);
    const coasts = [shore, ...(scene.chartCoastPx ?? []).map((c) => c.map(toGeo))].filter((c) => c.length > 1);
    // Carry open coasts well past whatever the chart shows, offshore clips included.
    const reach = Math.max(3000, 4 * (nearestCoast(coasts, scene.center)?.distanceM ?? 0));
    return {
      footprint: camera,
      shore,
      areas: coasts.map((c) => coastArea(c, scene.center, reach)).filter((a) => a !== undefined),
      swimZones: scene.swimZonesPx.map((z) => z.map(toGeo).map(ll)),
      fitBounds: [...camera, ...coastFraming(coasts, scene.center).map(ll)],
    };
  }, [scene, clip.width, clip.height]);

  if (!scene || !geometry) {
    return <div className="chart-grid grid h-full place-items-center text-[13px] text-ink-3">No location data for this clip.</div>;
  }
  const lat = scene.center.lat;
  const lon = scene.center.lon;
  // The distance that matters on a chart: the selected shark (or the one in view nearest shore, else
  // the last seen) to the beach.
  const placed = (list: TrackSummary[]) => list.filter((t) => t.kind === 'animal' && t.verdict === 'shark' && t.position && t.distanceToShoreM !== undefined);
  const nearestShore = (list: TrackSummary[]) => [...list].sort((a, b) => a.distanceToShoreM! - b.distanceToShoreM!)[0];
  const sharks = placed(tracks);
  const gone = placed(departed);
  const focus = [...sharks, ...gone].find((t) => t.id === selectedId) ?? nearestShore(sharks) ?? nearestShore(gone);
  const marks = [...departed.filter((t) => t.position && t.verdict !== 'not_shark').map((t) => ({ t, gone: true })), ...tracks.filter((t) => t.position).map((t) => ({ t, gone: false }))];
  const shorePoint = focus && geometry.shore.length > 1 ? nearestOnLine(focus.position!, geometry.shore).point : undefined;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={ll(scene.center)}
        zoom={18}
        maxZoom={21}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
        style={{ background: 'var(--color-chart-deep)' }}
        scrollWheelZoom
      >
        {geometry.areas.map((a, i) => (
          <Polygon key={`shoal-${i}`} positions={a.shoal.map(ll)} pathOptions={{ stroke: false, fillColor: SHOAL, fillOpacity: 1 }} interactive={false} />
        ))}
        {geometry.areas.map((a, i) => (
          <Polygon key={`land-${i}`} positions={a.land.map(ll)} pathOptions={{ stroke: false, fillColor: LAND, fillOpacity: 1 }} interactive={false} />
        ))}
        {geometry.areas.map((a, i) => (
          <Polyline key={`coast-${i}`} positions={a.coast.map(ll)} pathOptions={{ color: INK, weight: 1.25 }} interactive={false} />
        ))}
        <ScaleControl position="bottomleft" imperial={false} />
        <FitTo bounds={geometry.fitBounds} />
        {geometry.swimZones.map((zone, i) => (
          <Polygon key={i} positions={zone} pathOptions={{ color: MAGENTA, weight: 1.25, fillColor: MAGENTA, fillOpacity: 0.07, dashArray: '5 4' }}>
            <Tooltip sticky>Swim zone</Tooltip>
          </Polygon>
        ))}
        {focus && shorePoint && (
          <Polyline positions={[ll(focus.position!), ll(shorePoint)]} pathOptions={{ color: MAGENTA, weight: 1.5, dashArray: '3 4' }}>
            <Tooltip permanent direction="center" className="chart-label">
              {formatDistance(focus.distanceToShoreM!)} to shore
            </Tooltip>
          </Polyline>
        )}
        <Polygon positions={geometry.footprint} pathOptions={{ color: INK, weight: 1.5, fill: true, fillColor: INK, fillOpacity: 0.05, dashArray: '6 4' }}>
          <Tooltip sticky>Drone camera view</Tooltip>
        </Polygon>
        {/* The drone itself, visible however far out the chart is zoomed. */}
        <CircleMarker center={ll(scene.center)} radius={4} pathOptions={{ color: INK, weight: 1.5, fillColor: '#f7f8f4', fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -5]}>
            Drone
          </Tooltip>
        </CircleMarker>
        {marks.map(({ t, gone }) => {
          const tone = toneFor(t.kind, t.verdict);
          const color = tone === 'hidden' ? TONE_COLORS.neutral : TONE_COLORS[tone];
          const p = t.position!;
          const selected = t.id === selectedId;
          const heading =
            !gone && t.headingDeg !== undefined && t.speedMps !== undefined && t.speedMps > 0.05
              ? offsetGeo(p, { east: Math.sin((t.headingDeg * Math.PI) / 180) * 1.5, north: Math.cos((t.headingDeg * Math.PI) / 180) * 1.5 })
              : undefined;
          return (
            <span key={t.id}>
              {heading && <Polyline positions={[ll(p), ll(heading)]} pathOptions={{ color: INK, weight: 1.5 }} />}
              {selected && <CircleMarker center={ll(p)} radius={12} pathOptions={{ color: INK, weight: 1.25, fill: false, dashArray: '2 3' }} />}
              <CircleMarker
                center={ll(p)}
                radius={selected ? 7 : t.kind === 'person' ? 4 : 5}
                pathOptions={gone && !selected ? { color: INK, weight: 1, opacity: 0.55, fillColor: color, fillOpacity: 0.35, dashArray: '2 2' } : { color: INK, weight: 1.25, fillColor: color, fillOpacity: 1 }}
                eventHandlers={{ click: () => onSelect(t.id) }}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  {t.id} · {t.kind === 'person' ? 'person' : (t.verdict ?? 'candidate').replace('_', ' ')}
                  {gone ? ' · last seen here' : ''}
                </Tooltip>
              </CircleMarker>
            </span>
          );
        })}
      </MapContainer>

      <div className="num pointer-events-none absolute left-3 top-2.5 z-[500] font-mono text-[10.5px] text-ink-2 [text-shadow:0_0_4px_var(--color-paper)]">
        {Math.abs(lat).toFixed(4)}°{lat >= 0 ? 'N' : 'S'} {Math.abs(lon).toFixed(4)}°{lon >= 0 ? 'E' : 'W'}
      </div>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-1 right-2 z-[500] text-[10px] text-ink-3 hover:text-ink"
      >
        Coastline © OpenStreetMap contributors
      </a>
      <svg viewBox="0 0 40 40" className="pointer-events-none absolute right-2.5 top-2.5 z-[500] h-10 w-10" aria-label="North is up">
        <circle cx="20" cy="20" r="13" fill="none" stroke={INK} strokeWidth="0.8" />
        <path d="M20 5 L23.2 20 L20 18 L16.8 20 Z" fill={INK} />
        <path d="M20 35 L23.2 20 L20 22 L16.8 20 Z" fill="none" stroke={INK} strokeWidth="0.8" />
        <text x="20" y="4.2" textAnchor="middle" fontSize="5.5" fontFamily="-apple-system, Inter, sans-serif" fontWeight="700" fill={INK}>
          N
        </text>
      </svg>
    </div>
  );
}
