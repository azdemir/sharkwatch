// The simulated drone's view of a clip: pixel → ground coordinates, shoreline and swim zones.

import type { ClipManifest } from '../../shared/manifest.ts';
import { footprint, pixelToGeo, pixelToLocal, type CameraPose, type GeoPoint, type LocalPoint } from '../../shared/geo/project.ts';
import { distanceToPolyline, insidePolygon } from '../../shared/geo/shore.ts';

export interface Scene {
  pose: CameraPose;
  cameraMoves: boolean;
  shoreline: GeoPoint[];
  swimZones: GeoPoint[][];
  beachName?: string;
}

export function sceneFor(manifest: ClipManifest): Scene | undefined {
  const s = manifest.scene;
  if (!s) return undefined;
  const pose: CameraPose = {
    center: s.center,
    headingDeg: s.headingDeg,
    gsd: s.gsd,
    imageWidthPx: manifest.width,
    imageHeightPx: manifest.height,
  };
  return {
    pose,
    cameraMoves: s.cameraMoves,
    shoreline: s.shorelinePx.map(([x, y]) => pixelToGeo(x, y, pose)),
    swimZones: s.swimZonesPx.map((zone) => zone.map(([x, y]) => pixelToGeo(x, y, pose))),
    beachName: s.beachName,
  };
}

export function toGeo(scene: Scene, x: number, y: number): GeoPoint {
  return pixelToGeo(x, y, scene.pose);
}

export function toLocal(scene: Scene, x: number, y: number): LocalPoint {
  return pixelToLocal(x, y, scene.pose);
}

export function shoreDistance(scene: Scene, point: GeoPoint): number | undefined {
  return scene.shoreline.length ? distanceToPolyline(point, scene.shoreline) : undefined;
}

export function inSwimZone(scene: Scene, point: GeoPoint): boolean {
  return scene.swimZones.some((zone) => insidePolygon(point, zone));
}

export function sceneFootprint(scene: Scene): GeoPoint[] {
  return footprint(scene.pose);
}
