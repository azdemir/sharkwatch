// Turns per-prompt SAM results for one chunk into chunk-local tracks, then merges the prompts:
// a `fish` track that is really one of the `shark` tracks is folded into it, and an animal track
// that is really a person is dropped.

import { decodeMaskToRaster, decodeMaskToSVGPath } from '@meta-sam/parser';
import type { Concept, TrackKind } from '../../shared/events.ts';
import { simplifyMaskPath } from '../../shared/maskPath.ts';
import type { SamBox, SamDetection } from '../meta/sam.ts';
import { iou } from './geometry.ts';
import { maskGeometry, type MaskGeometry } from './metrics.ts';

export interface LocalDetection {
  /** Global analysis frame. */
  frame: number;
  box: SamBox;
  confidence?: number;
  geometry?: MaskGeometry;
  maskPath?: string;
  maskSize?: [number, number];
}

export interface LocalTrack {
  /** `${concept}:${objectId}`, unique within the chunk. */
  key: string;
  kind: TrackKind;
  concepts: Concept[];
  detections: Map<number, LocalDetection>;
}

export function localTracksFrom(concept: Concept, detections: SamDetection[], chunkStartFrame: number): LocalTrack[] {
  const tracks = new Map<string, LocalTrack>();
  for (const d of detections) {
    const key = `${concept}:${d.objectId}`;
    let track = tracks.get(key);
    if (!track) {
      track = { key, kind: concept === 'person' ? 'person' : 'animal', concepts: [concept], detections: new Map() };
      tracks.set(key, track);
    }
    const frame = chunkStartFrame + d.frameIndex;
    const local: LocalDetection = { frame, box: d.box, confidence: d.confidence };
    if (d.mask && d.maskBounds) {
      local.geometry = maskGeometry(decodeMaskToRaster(d.mask), d.mask.width, d.mask.height, d.maskBounds) ?? undefined;
      local.maskPath = simplifyMaskPath(decodeMaskToSVGPath(d.mask));
      local.maskSize = [d.mask.width, d.mask.height];
    }
    track.detections.set(frame, local);
  }
  return [...tracks.values()];
}

/**
 * Mean IoU over frames where both tracks are present, or 0 if they rarely coexist
 * (fewer than 3 shared frames or under 30% of the shorter track).
 */
export function sharedIou(a: LocalTrack, b: LocalTrack): number {
  let sum = 0;
  let shared = 0;
  for (const [frame, da] of a.detections) {
    const db = b.detections.get(frame);
    if (!db) continue;
    sum += iou(da.box, db.box);
    shared++;
  }
  const shorter = Math.min(a.detections.size, b.detections.size);
  if (shared < 3 || shared < 0.3 * shorter) return 0;
  return sum / shared;
}

export const DUPLICATE_IOU = 0.5;
/** An animal box this much inside a person box (on average) is part of the person: a limb, a float. */
export const CONTAINED_IN_PERSON = 0.6;

/** Mean fraction of `inner`'s box area that lies inside `outer`'s box, over shared frames. */
export function containment(inner: LocalTrack, outer: LocalTrack): number {
  let sum = 0;
  let shared = 0;
  for (const [frame, di] of inner.detections) {
    const dO = outer.detections.get(frame);
    if (!dO) continue;
    const w = Math.min(di.box.right, dO.box.right) - Math.max(di.box.left, dO.box.left);
    const h = Math.min(di.box.bottom, dO.box.bottom) - Math.max(di.box.top, dO.box.top);
    const area = (di.box.right - di.box.left) * (di.box.bottom - di.box.top);
    sum += w > 0 && h > 0 && area > 0 ? (w * h) / area : 0;
    shared++;
  }
  return shared >= 3 ? sum / shared : 0;
}

/** Merges one chunk's per-prompt tracks into animal and person tracks without duplicates. */
export function mergeConcepts(byConcept: Partial<Record<Concept, LocalTrack[]>>): LocalTrack[] {
  const sharks = byConcept.shark ?? [];
  const persons = byConcept.person ?? [];
  const animals: LocalTrack[] = [...sharks];

  for (const fish of byConcept.fish ?? []) {
    let best: LocalTrack | undefined;
    let bestScore = DUPLICATE_IOU;
    for (const shark of sharks) {
      const score = sharedIou(fish, shark);
      if (score >= bestScore) {
        best = shark;
        bestScore = score;
      }
    }
    if (best) {
      if (!best.concepts.includes('fish')) best.concepts.push('fish');
      // Fill frames the shark prompt missed.
      for (const [frame, d] of fish.detections) if (!best.detections.has(frame)) best.detections.set(frame, d);
    } else {
      animals.push(fish);
    }
  }

  // Generic-prompt hits on part of a person are dropped; a shark-prompt hit next to a swimmer is kept.
  const keptAnimals = animals.filter(
    (a) =>
      !persons.some(
        (p) => sharedIou(a, p) >= DUPLICATE_IOU || (!a.concepts.includes('shark') && containment(a, p) >= CONTAINED_IN_PERSON),
      ),
  );
  return [...keptAnimals, ...persons];
}
