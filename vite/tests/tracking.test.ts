import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Concept } from '../src/shared/events.ts';
import { detectionsFrom, parseRawOutput, type SamBox } from '../src/server/meta/sam.ts';
import { localTracksFrom, mergeConcepts, type LocalTrack } from '../src/server/pipeline/detections.ts';
import type { Scene } from '../src/server/pipeline/scene.ts';
import { Tracker } from '../src/server/pipeline/tracker.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'sam');

async function fixtureTracks(file: string, concept: Concept, startFrame = 0): Promise<LocalTrack[]> {
  const result = await parseRawOutput(readFileSync(join(FIXTURES, file), 'utf8'));
  return localTracksFrom(concept, detectionsFrom(result), startFrame);
}

describe('mergeConcepts on real SAM output', () => {
  it('keeps fish candidates when the shark prompt finds nothing (dense shoreline scene)', async () => {
    const merged = mergeConcepts({
      shark: await fixtureTracks('clip-a-shoreline-c0-shark.txt', 'shark'),
      fish: await fixtureTracks('clip-a-shoreline-c0-fish.txt', 'fish'),
      person: await fixtureTracks('clip-a-shoreline-c0-person.txt', 'person'),
    });
    const animals = merged.filter((t) => t.kind === 'animal');
    expect(animals.length).toBeGreaterThanOrEqual(10);
    expect(animals.every((t) => t.concepts.join() === 'fish')).toBe(true);
    expect(merged.filter((t) => t.kind === 'person')).toHaveLength(1);
    // Masks are decoded into geometry for measurement and SVG paths for drawing.
    const d = [...animals[0]!.detections.values()][0]!;
    expect(d.geometry?.majorAxisPx).toBeGreaterThan(20);
    expect(d.maskPath).toMatch(/^M/);
  });

  it('folds a fish track into the shark track it duplicates', async () => {
    const sharks = await fixtureTracks('clip-d-reef-shark-c0-shark.txt', 'shark');
    const fish = await fixtureTracks('clip-d-reef-shark-c0-fish.txt', 'fish');
    const sharkFrames = sharks[0]!.detections.size;
    const merged = mergeConcepts({ shark: sharks, fish });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.concepts).toEqual(['shark', 'fish']);
    // Frames the shark prompt missed (8 of 46) are filled from the fish prompt.
    expect(merged[0]!.detections.size).toBeGreaterThan(sharkFrames);
  });

  it('separates sharks from the people they surround', async () => {
    const merged = mergeConcepts({
      shark: await fixtureTracks('clip-b-swimmer-c0-shark.txt', 'shark'),
      person: await fixtureTracks('clip-b-swimmer-c0-person.txt', 'person'),
    });
    expect(merged.filter((t) => t.kind === 'person')).toHaveLength(2);
    expect(merged.filter((t) => t.kind === 'animal').length).toBeGreaterThanOrEqual(12);
  });
});

/** A synthetic chunk-local track: a box of size w×h moving `vx` px/frame from (x0, y0). */
function moving(key: string, frames: [number, number], x0: number, y0: number, vx: number, kind: 'animal' | 'person' = 'animal', w = 60, h = 20): LocalTrack {
  const detections = new Map();
  for (let f = frames[0]; f <= frames[1]; f++) {
    const left = x0 + vx * (f - frames[0]);
    const box: SamBox = { left, top: y0, right: left + w, bottom: y0 + h };
    detections.set(f, { frame: f, box, confidence: 0.8, geometry: { areaPx: w * h, centroid: { x: left + w / 2, y: y0 + h / 2 }, majorAxisPx: w, minorAxisPx: h, orientationDeg: 0 } });
  }
  return { key, kind, concepts: [kind === 'person' ? 'person' : 'shark'], detections };
}

describe('Tracker across chunks', () => {
  it('keeps one id across overlapping chunks and emits each frame once', () => {
    const tracker = new Tracker({ fps: 10 });
    const a = tracker.ingest({ startFrame: 0, frameCount: 60 }, [moving('shark:0', [0, 59], 100, 300, 2)]);
    const b = tracker.ingest({ startFrame: 50, frameCount: 60 }, [moving('shark:7', [50, 109], 200, 300, 2)]);
    expect(a.frames.map((f) => f.frame)).toEqual([...Array(60).keys()]);
    expect(b.frames[0]!.frame).toBe(60);
    expect(b.frames.at(-1)!.frame).toBe(109);
    const ids = new Set([...a.frames, ...b.frames].flatMap((f) => f.objects.map((o) => o.trackId)));
    expect([...ids]).toEqual(['T1']);
    expect(a.toVerify).toEqual(['T1']);
    expect(b.toVerify).toEqual([]);
  });

  it('starts a new track for a new animal and loses one that disappears', () => {
    const tracker = new Tracker({ fps: 10 });
    tracker.ingest({ startFrame: 0, frameCount: 60 }, [moving('shark:0', [0, 59], 100, 300, 0)]);
    const next = tracker.ingest({ startFrame: 50, frameCount: 60 }, [moving('fish:1', [70, 109], 900, 100, 0)]);
    const byId = new Map(next.updated.map((t) => [t.id, t]));
    expect(byId.get('T2')?.lifecycle).toBe('active');
    expect(byId.get('T1')?.lifecycle).toBe('lost');
  });

  it('re-links a track across a gap with no shared frames using its motion', () => {
    const tracker = new Tracker({ fps: 10 });
    tracker.ingest({ startFrame: 0, frameCount: 60 }, [moving('shark:0', [0, 45], 100, 300, 3)]);
    // Missed for frames 46–54, then seen again where its motion predicts.
    const next = tracker.ingest({ startFrame: 50, frameCount: 60 }, [moving('shark:3', [55, 109], 100 + 3 * 55, 300, 3)]);
    expect(next.updated.map((t) => t.id)).toEqual(['T1']);
  });

  it('never matches an animal to a person track', () => {
    const tracker = new Tracker({ fps: 10 });
    tracker.ingest({ startFrame: 0, frameCount: 60 }, [moving('person:0', [0, 59], 100, 300, 0, 'person')]);
    const next = tracker.ingest({ startFrame: 50, frameCount: 60 }, [moving('fish:0', [50, 109], 100, 300, 0)]);
    expect(next.updated.find((t) => t.kind === 'animal')?.id).toBe('T2');
  });
});

describe('Track measurements', () => {
  const scene: Scene = {
    pose: { center: { lat: 25.79, lon: -80.127 }, headingDeg: 0, gsd: 0.01, imageWidthPx: 1280, imageHeightPx: 720 },
    cameraMoves: false,
    shoreline: [],
    swimZones: [],
  };

  it('measures length, speed and heading from mask geometry', () => {
    const tracker = new Tracker({ fps: 10, scene });
    // 250 px long at 0.01 m/px = 2.5 m; moving 10 px/frame = 1 m/s toward image right (east).
    const { updated } = tracker.ingest({ startFrame: 0, frameCount: 60 }, [moving('shark:0', [0, 59], 100, 300, 10, 'animal', 250, 40)]);
    const t = updated[0]!;
    expect(t.length?.meters).toBeCloseTo(2.5, 6);
    expect(t.length?.sizeClass).toBe('medium');
    expect(t.speedMps).toBeCloseTo(1, 1);
    expect(t.headingDeg).toBeCloseTo(90, 0);
  });

  it('reports the distance to the nearest person in the same frame', () => {
    const tracker = new Tracker({ fps: 10, scene });
    const { updated } = tracker.ingest({ startFrame: 0, frameCount: 60 }, [
      moving('shark:0', [0, 59], 100, 300, 0, 'animal', 200, 40),
      // Person centre 250 px (2.5 m) to the right of the shark centre.
      moving('person:0', [0, 59], 350, 300, 0, 'person', 200, 40),
    ]);
    expect(updated.find((t) => t.kind === 'animal')?.nearestPersonM).toBeCloseTo(2.5, 1);
  });

  it('ignores a "person" seen for only a couple of frames', () => {
    const tracker = new Tracker({ fps: 10, scene });
    const { updated } = tracker.ingest({ startFrame: 0, frameCount: 60 }, [
      moving('shark:0', [0, 59], 100, 300, 0, 'animal', 200, 40),
      moving('person:0', [58, 59], 350, 300, 0, 'person', 200, 40),
    ]);
    expect(updated.find((t) => t.kind === 'animal')?.nearestPersonM).toBeUndefined();
  });

  it('marks the length unreliable when Muse Spark counts more than one animal in the outline', () => {
    const tracker = new Tracker({ fps: 10, scene });
    const { updated } = tracker.ingest({ startFrame: 0, frameCount: 60 }, [moving('shark:0', [0, 59], 100, 300, 0, 'animal', 320, 120)]);
    expect(updated[0]!.length?.reliable).toBeUndefined();
    const after = tracker.setVerdict('T1', 'shark', { is_shark: true, label: 'shark', confidence: 0.9, species_guess: 'nurse shark', species_confidence: 'medium', behavior: '', evidence: [], bodies_in_outline: 2, latencyMs: 0 })!;
    expect(after.length?.reliable).toBe(false);
  });

  it('flags a track whose outline length more than doubles as unstable', () => {
    const track = (key: string, lengthAt: (f: number) => number): LocalTrack => {
      const detections = new Map();
      for (let f = 0; f < 60; f++) {
        const len = lengthAt(f);
        const box = { left: 400, top: 300, right: 400 + len, bottom: 340 };
        detections.set(f, { frame: f, box, confidence: 0.9, geometry: { areaPx: len * 30, centroid: { x: 400 + len / 2, y: 320 }, majorAxisPx: len, minorAxisPx: 30, orientationDeg: 0 } });
      }
      return { key, kind: 'animal', concepts: ['shark'], detections };
    };
    const tracker = new Tracker({ fps: 10, scene });
    const { updated } = tracker.ingest({ startFrame: 0, frameCount: 60 }, [
      track('shark:0', () => 250),
      // Grows from 200 px to 600 px: a neighbour being absorbed into the outline.
      track('shark:1', (f) => 200 + (400 * f) / 59),
    ]);
    const [steady, merging] = updated;
    expect(steady!.length?.reliable).toBeUndefined();
    expect(steady!.length?.meters).toBeCloseTo(2.5, 6);
    expect(merging!.length).toMatchObject({ reliable: false, unreliableReason: 'unstable' });
    // The shown range spans what the outline actually measured.
    expect(merging!.length!.low).toBeLessThanOrEqual(2.4);
    expect(merging!.length!.high).toBeGreaterThanOrEqual(5.5);
  });

  it('hides speed when the camera moves', () => {
    const tracker = new Tracker({ fps: 10, scene: { ...scene, cameraMoves: true } });
    const { updated } = tracker.ingest({ startFrame: 0, frameCount: 60 }, [moving('shark:0', [0, 59], 100, 300, 10)]);
    expect(updated[0]!.speedMps).toBeUndefined();
    expect(updated[0]!.position).toBeDefined();
  });
});
