// Moved from sharkwatch-vite/src/shared/geo/project.ts (verbatim).
// Local flat-earth projection between image pixels, local east/north metres and lat/lon.
// Accurate to well under a metre over the few hundred metres a drone frame covers.

const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface LocalPoint {
  east: number;
  north: number;
}

export interface CameraPose {
  center: GeoPoint;
  headingDeg: number;
  gsd: number;
  imageWidthPx: number;
  imageHeightPx: number;
}

export function offsetGeo(origin: GeoPoint, offset: LocalPoint): GeoPoint {
  return {
    lat: origin.lat + offset.north / EARTH_RADIUS_M / DEG,
    lon: origin.lon + offset.east / (EARTH_RADIUS_M * Math.cos(origin.lat * DEG)) / DEG,
  };
}

export function toLocal(origin: GeoPoint, point: GeoPoint): LocalPoint {
  return {
    east: (point.lon - origin.lon) * DEG * EARTH_RADIUS_M * Math.cos(origin.lat * DEG),
    north: (point.lat - origin.lat) * DEG * EARTH_RADIUS_M,
  };
}

export function pixelToLocal(x: number, y: number, pose: CameraPose): LocalPoint {
  const right = (x - pose.imageWidthPx / 2) * pose.gsd;
  const forward = (pose.imageHeightPx / 2 - y) * pose.gsd;
  const h = pose.headingDeg * DEG;
  return {
    east: right * Math.cos(h) + forward * Math.sin(h),
    north: -right * Math.sin(h) + forward * Math.cos(h),
  };
}

export function pixelToGeo(x: number, y: number, pose: CameraPose): GeoPoint {
  return offsetGeo(pose.center, pixelToLocal(x, y, pose));
}

export function footprint(pose: CameraPose): GeoPoint[] {
  const { imageWidthPx: w, imageHeightPx: h } = pose;
  return [
    pixelToGeo(0, 0, pose),
    pixelToGeo(w, 0, pose),
    pixelToGeo(w, h, pose),
    pixelToGeo(0, h, pose),
  ];
}

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const d = toLocal(a, b);
  return Math.hypot(d.east, d.north);
}

export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const d = toLocal(a, b);
  return (Math.atan2(d.east, d.north) / DEG + 360) % 360;
}
