import { describe, expect, it } from 'vitest';
import {
  estimateLength,
  groundSampleDistance,
  gsdFromReference,
  rescaleGsd,
  sizeClassOf,
} from '../src/shared/geo/gsd.ts';
import { estimateVelocity, type PositionSample } from '../src/shared/geo/motion.ts';
import {
  bearingDeg,
  distanceMeters,
  footprint,
  offsetGeo,
  pixelToGeo,
  pixelToLocal,
  toLocal,
  type CameraPose,
} from '../src/shared/geo/project.ts';
import { distanceToPolyline, insidePolygon, shoreApproachRate } from '../src/shared/geo/shore.ts';

const beach = { lat: 34.4208, lon: -119.6982 };

describe('ground sampling distance', () => {
  it('matches the nadir formula and rescales with frame width', () => {
    const gsd = groundSampleDistance(60, { sensorWidthMm: 13.2, focalLengthMm: 8.8, imageWidthPx: 5472 });
    expect(gsd).toBeCloseTo((60 * 13.2) / (8.8 * 5472), 10);
    expect(rescaleGsd(gsd, 5472, 1280)).toBeCloseTo((gsd * 5472) / 1280, 10);
    expect(gsdFromReference(2.1, 70)).toBeCloseTo(0.03, 10);
    expect(() => groundSampleDistance(0, { sensorWidthMm: 13.2, focalLengthMm: 8.8, imageWidthPx: 5472 })).toThrow();
  });

  it('brackets the length estimate and classifies it', () => {
    const est = estimateLength(100, 0.028);
    expect(est.meters).toBeCloseTo(2.8, 10);
    expect(est.low).toBeLessThan(est.meters);
    expect(est.high).toBeGreaterThan(est.meters * 1.15);
    expect(est.sizeClass).toBe('medium');
    expect(sizeClassOf(1.2)).toBe('small');
    expect(sizeClassOf(3.4)).toBe('large');
  });
});

describe('projection', () => {
  const pose = (headingDeg: number): CameraPose => ({
    center: beach,
    headingDeg,
    gsd: 0.05,
    imageWidthPx: 1280,
    imageHeightPx: 720,
  });

  it('moves east when an object moves up the frame with the camera facing east', () => {
    const p = pixelToLocal(640, 360 - 100, pose(90));
    expect(p.east).toBeCloseTo(5, 6);
    expect(p.north).toBeCloseTo(0, 6);
  });

  it('maps image right to east when facing north and to south when facing east', () => {
    expect(pixelToLocal(740, 360, pose(0)).east).toBeCloseTo(5, 6);
    expect(pixelToLocal(740, 360, pose(90)).north).toBeCloseTo(-5, 6);
  });

  it('round-trips pixels through lat/lon to local metres', () => {
    const local = pixelToLocal(1000, 100, pose(37));
    const back = toLocal(beach, pixelToGeo(1000, 100, pose(37)));
    expect(back.east).toBeCloseTo(local.east, 3);
    expect(back.north).toBeCloseTo(local.north, 3);
  });

  it('measures distances and bearings', () => {
    const north = offsetGeo(beach, { east: 0, north: 100 });
    const east = offsetGeo(beach, { east: 100, north: 0 });
    expect(distanceMeters(beach, north)).toBeCloseTo(100, 3);
    expect(bearingDeg(beach, east)).toBeCloseTo(90, 3);
    expect(bearingDeg(beach, north)).toBeCloseTo(0, 3);
    expect(footprint(pose(0))).toHaveLength(4);
  });
});

describe('motion', () => {
  it('fits speed and heading through noisy samples', () => {
    const samples: PositionSample[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i * 0.1;
      const jitter = (i % 2 === 0 ? 1 : -1) * 0.05;
      samples.push({ t, east: 1.5 * t + jitter, north: jitter });
    }
    const v = estimateVelocity(samples)!;
    expect(v.speedMps).toBeCloseTo(1.5, 1);
    expect(v.headingDeg).toBeGreaterThan(85);
    expect(v.headingDeg).toBeLessThan(95);
  });

  it('needs at least three samples in the window', () => {
    expect(estimateVelocity([{ t: 0, east: 0, north: 0 }, { t: 0.1, east: 1, north: 0 }])).toBeNull();
  });
});

describe('shore', () => {
  const shoreline = [offsetGeo(beach, { east: -500, north: 0 }), offsetGeo(beach, { east: 500, north: 0 })];

  it('measures distance to the shoreline', () => {
    expect(distanceToPolyline(offsetGeo(beach, { east: 120, north: 50 }), shoreline)).toBeCloseTo(50, 2);
    expect(distanceToPolyline(offsetGeo(beach, { east: 530, north: 40 }), shoreline)).toBeCloseTo(50, 2);
  });

  it('tests swim-zone membership', () => {
    const zone = [
      offsetGeo(beach, { east: -100, north: 0 }),
      offsetGeo(beach, { east: 100, north: 0 }),
      offsetGeo(beach, { east: 100, north: 80 }),
      offsetGeo(beach, { east: -100, north: 80 }),
    ];
    expect(insidePolygon(offsetGeo(beach, { east: 10, north: 40 }), zone)).toBe(true);
    expect(insidePolygon(offsetGeo(beach, { east: 10, north: 120 }), zone)).toBe(false);
  });

  it('reports approach rate toward the shore', () => {
    expect(shoreApproachRate([{ t: 0, distanceM: 80 }, { t: 4, distanceM: 72 }])).toBeCloseTo(2, 6);
  });
});
