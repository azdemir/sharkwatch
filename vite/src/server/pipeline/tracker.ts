// Global tracks across chunks. SAM's object ids only hold within one response, so each chunk's
// tracks are matched to existing ones by mean IoU over the frames both chunks cover (the overlap),
// falling back to a motion-predicted box when they share no frames.

import { CONFIRM_FRAMES, type Concept, type FrameDetections, type FrameObject, type LengthJson, type TrackKind, type TrackLifecycle, type TrackSummary, type TrackVerdict, type VerificationJson } from '../../shared/events.ts';
import { DEFAULT_LENGTH_ERROR, estimateLength, type LengthErrorModel } from '../../shared/geo/gsd.ts';
import { estimateVelocity, type PositionSample } from '../../shared/geo/motion.ts';
import { distanceMeters } from '../../shared/geo/project.ts';
import { shoreApproachRate } from '../../shared/geo/shore.ts';
import type { LocalDetection, LocalTrack } from './detections.ts';
import type { SamBox } from '../meta/sam.ts';
import { boxCenter, extrapolateBox, iou, median } from './geometry.ts';
import { inSwimZone, shoreDistance, toGeo, toLocal, type Scene } from './scene.ts';

export interface TrackerOptions {
  fps: number;
  scene?: Scene;
  /** Frame size, used to ignore partial bodies cut off by the frame edge when measuring. */
  frame?: { width: number; height: number };
  /** Generic-prompt candidates shorter than this are marked too small instead of verified. */
  minAssessLengthM?: number;
  /** Minimum association score to continue a track. */
  matchThreshold?: number;
  /** Frames a track may go unseen before it is lost (and still be re-matched up to then). */
  lostAfterFrames?: number;
  /** Frames (with confidence ≥ 0.5) needed before a track counts as real. */
  confirmFrames?: number;
  lengthError?: LengthErrorModel;
}

interface GlobalTrack {
  id: string;
  kind: TrackKind;
  concepts: Set<Concept>;
  detections: Map<number, LocalDetection>;
  firstFrame: number;
  lastFrame: number;
  lifecycle: TrackLifecycle;
  verdict?: TrackVerdict;
  verification?: VerificationJson;
  evidence?: string;
}

export interface IngestResult {
  /** Newly emitted frames (each frame is emitted once, in order). */
  frames: FrameDetections[];
  /** Tracks whose summary changed. */
  updated: TrackSummary[];
  /** Animal tracks that just became real and need verification. */
  toVerify: string[];
}

const KEEP_FRAMES = 300;
/** A track whose longest outlines are this much longer than its shortest is not one stable body. */
const UNSTABLE_LENGTH_RATIO = 2;

export class Tracker {
  private readonly tracks = new Map<string, GlobalTrack>();
  private nextId = 1;
  private lastEmitted = -1;
  private readonly opts: Required<Omit<TrackerOptions, 'scene' | 'lengthError' | 'frame'>> &
    Pick<TrackerOptions, 'scene' | 'lengthError' | 'frame'>;

  constructor(options: TrackerOptions) {
    this.opts = {
      matchThreshold: 0.3,
      lostAfterFrames: 3 * options.fps,
      confirmFrames: CONFIRM_FRAMES,
      minAssessLengthM: 0.8,
      ...options,
    };
  }

  get lastEmittedFrame(): number {
    return this.lastEmitted;
  }

  ingest(chunk: { startFrame: number; frameCount: number }, locals: LocalTrack[]): IngestResult {
    const chunkEnd = chunk.startFrame + chunk.frameCount - 1;
    const assignment = this.associate(locals);
    const changed = new Set<string>();

    for (const local of locals) {
      let track = assignment.get(local);
      if (!track) {
        track = {
          id: `T${this.nextId++}`,
          kind: local.kind,
          concepts: new Set(),
          detections: new Map(),
          firstFrame: Infinity,
          lastFrame: -1,
          lifecycle: 'tentative',
          verdict: local.kind === 'animal' ? 'pending' : undefined,
        };
        this.tracks.set(track.id, track);
      }
      for (const c of local.concepts) track.concepts.add(c);
      // Frames already emitted keep the earlier chunk's detection so nothing shown changes retroactively.
      for (const [frame, d] of local.detections) {
        if (frame <= this.lastEmitted && track.detections.has(frame)) continue;
        track.detections.set(frame, d);
        track.firstFrame = Math.min(track.firstFrame, frame);
        track.lastFrame = Math.max(track.lastFrame, frame);
      }
      this.trim(track);
      // A lost track picked up again (within the re-match window) is back on screen.
      if (track.lifecycle === 'lost') {
        track.lifecycle = this.confidentFrames(track) >= this.opts.confirmFrames ? 'active' : 'tentative';
      }
      changed.add(track.id);
    }

    const toVerify: string[] = [];
    for (const track of this.tracks.values()) {
      const before = `${track.lifecycle}/${track.verdict}`;
      if (track.lifecycle !== 'lost' && chunkEnd - track.lastFrame > this.opts.lostAfterFrames) {
        track.lifecycle = 'lost';
      } else if (track.lifecycle === 'tentative' && this.confidentFrames(track) >= this.opts.confirmFrames) {
        track.lifecycle = 'active';
        if (track.kind === 'animal' && track.verdict === 'pending') {
          const length = this.summary(track.id)?.length;
          const genericOnly = !track.concepts.has('shark');
          if (genericOnly && length && length.meters < this.opts.minAssessLengthM) track.verdict = 'too_small';
          else toVerify.push(track.id);
        }
      }
      if (`${track.lifecycle}/${track.verdict}` !== before) changed.add(track.id);
    }

    const frames: FrameDetections[] = [];
    for (let frame = Math.max(this.lastEmitted + 1, chunk.startFrame); frame <= chunkEnd; frame++) {
      const objects: FrameObject[] = [];
      for (const track of this.tracks.values()) {
        const d = track.detections.get(frame);
        if (!d) continue;
        objects.push({
          trackId: track.id,
          kind: track.kind,
          box: [d.box.left, d.box.top, d.box.right, d.box.bottom],
          confidence: d.confidence,
          maskPath: d.maskPath,
          maskSize: d.maskSize,
        });
      }
      frames.push({ frame, objects });
    }
    this.lastEmitted = Math.max(this.lastEmitted, chunkEnd);

    return { frames, updated: [...changed].map((id) => this.summary(id)!), toVerify };
  }

  setVerdict(trackId: string, verdict: TrackVerdict, verification?: VerificationJson, evidence?: string): TrackSummary | undefined {
    const track = this.tracks.get(trackId);
    if (!track) return undefined;
    track.verdict = verdict;
    if (verification) track.verification = verification;
    if (evidence) track.evidence = evidence;
    return this.summary(trackId);
  }

  /** Recent detections of a track, newest last, for picking evidence frames. */
  /** Every person detection between two frames (end exclusive), for privacy in evidence photos. */
  peopleDetections(from: number, to: number): LocalDetection[] {
    const out: LocalDetection[] = [];
    for (const track of this.tracks.values()) {
      if (track.kind !== 'person') continue;
      for (const d of track.detections.values()) if (d.frame >= from && d.frame < to) out.push(d);
    }
    return out;
  }

  detectionsOf(trackId: string): LocalDetection[] {
    const track = this.tracks.get(trackId);
    return track ? [...track.detections.values()].sort((a, b) => a.frame - b.frame) : [];
  }

  summaries(): TrackSummary[] {
    return [...this.tracks.keys()].map((id) => this.summary(id)!);
  }

  summary(trackId: string): TrackSummary | undefined {
    const track = this.tracks.get(trackId);
    if (!track) return undefined;
    const detections = [...track.detections.values()].sort((a, b) => a.frame - b.frame);
    const confidences = detections.map((d) => d.confidence).filter((c): c is number => c !== undefined);
    const summary: TrackSummary = {
      id: track.id,
      kind: track.kind,
      lifecycle: track.lifecycle,
      verdict: track.verdict,
      verification: track.verification,
      concepts: [...track.concepts],
      firstFrame: track.firstFrame,
      lastFrame: track.lastFrame,
      framesSeen: detections.length,
      meanConfidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined,
      evidence: track.evidence,
    };

    const scene = this.opts.scene;
    const last = detections.at(-1);
    if (!scene || !last) return summary;

    // Measure only whole, unoccluded bodies: skip frames cut off by the frame edge or with a mask far
    // smaller than usual, then take the median of what's left (a bending body also reads short).
    const whole = this.wholeBodyDetections(detections);
    // The whole history, not a recent window: a merge that builds up slowly only shows across it.
    const lengthsPx = (whole.length ? whole : detections).map((d) => d.geometry?.majorAxisPx).filter((v): v is number => v !== undefined);
    const lengthPx = median(lengthsPx);
    if (lengthPx !== undefined && track.kind === 'animal') {
      const gsd = scene.pose.gsd;
      const error = this.opts.lengthError ?? DEFAULT_LENGTH_ERROR;
      const length: LengthJson = estimateLength(lengthPx, gsd, error);
      // The range also covers how much the outline itself varied (turning, diving, merging).
      const sorted = [...lengthsPx].sort((a, b) => a - b);
      const p10 = sorted[Math.floor(0.1 * (sorted.length - 1))]!;
      const p90 = sorted[Math.ceil(0.9 * (sorted.length - 1))]!;
      length.low = Math.min(length.low, p10 * gsd * (1 - error.gsdRelativeError));
      length.high = Math.max(length.high, p90 * gsd * (1 + error.gsdRelativeError));
      if (sorted.length >= 10 && p90 > UNSTABLE_LENGTH_RATIO * p10) {
        // A body doesn't double in length: SAM is absorbing a neighbour into the outline in some frames.
        length.reliable = false;
        length.unreliableReason = 'unstable';
      }
      if ((track.verification?.bodies_in_outline ?? 1) > 1) {
        // Muse Spark counted more than one body inside the outline (SAM merged overlapping animals).
        length.reliable = false;
        length.unreliableReason = 'merged';
      }
      summary.length = length;
    }

    const centerOf = (d: LocalDetection) => d.geometry?.centroid ?? boxCenter(d.box);
    const c = centerOf(last);
    const position = toGeo(scene, c.x, c.y);
    summary.position = position;

    if (!scene.cameraMoves) {
      // A centroid jumps when a body slides out of frame, so speed uses whole-body frames only, and
      // needs at least a second of them to be meaningful.
      const windowFrames = 2 * this.opts.fps;
      const recent = whole.filter((d) => d.frame >= last.frame - windowFrames);
      const spanS = recent.length ? (recent.at(-1)!.frame - recent[0]!.frame) / this.opts.fps : 0;
      if (recent.length >= 8 && spanS >= 1) {
        const samples: PositionSample[] = recent.map((d) => {
          const p = centerOf(d);
          return { t: d.frame / this.opts.fps, ...toLocal(scene, p.x, p.y) };
        });
        const velocity = estimateVelocity(samples, 2);
        if (velocity) {
          summary.speedMps = velocity.speedMps;
          summary.headingDeg = velocity.headingDeg;
        }
      }
    }

    const shore = shoreDistance(scene, position);
    if (shore !== undefined) {
      summary.distanceToShoreM = shore;
      const earlier = detections.find((d) => d.frame >= last.frame - 2 * this.opts.fps);
      if (earlier && earlier !== last && !scene.cameraMoves) {
        const e = centerOf(earlier);
        const before = shoreDistance(scene, toGeo(scene, e.x, e.y))!;
        summary.shoreApproachMps =
          shoreApproachRate([
            { t: earlier.frame / this.opts.fps, distanceM: before },
            { t: last.frame / this.opts.fps, distanceM: shore },
          ]) ?? undefined;
      }
    }
    summary.inSwimZone = inSwimZone(scene, position);

    if (track.kind === 'animal') {
      let nearest: number | undefined;
      for (const other of this.tracks.values()) {
        // Only people seen long enough to be real: a two-frame "person" must not make it "near swimmers".
        if (other.kind !== 'person' || this.confidentFrames(other) < this.opts.confirmFrames) continue;
        const p = other.detections.get(last.frame);
        if (!p) continue;
        const pc = centerOf(p);
        const d = distanceMeters(position, toGeo(scene, pc.x, pc.y));
        nearest = nearest === undefined ? d : Math.min(nearest, d);
      }
      if (nearest !== undefined) summary.nearestPersonM = nearest;
    }
    return summary;
  }

  private touchesEdge(d: LocalDetection): boolean {
    const frame = this.opts.frame ?? (this.opts.scene && { width: this.opts.scene.pose.imageWidthPx, height: this.opts.scene.pose.imageHeightPx });
    if (!frame) return false;
    const margin = 2;
    return d.box.left <= margin || d.box.top <= margin || d.box.right >= frame.width - margin || d.box.bottom >= frame.height - margin;
  }

  private wholeBodyDetections(detections: LocalDetection[]): LocalDetection[] {
    const inside = detections.filter((d) => !this.touchesEdge(d));
    const typicalArea = median(inside.map((d) => d.geometry?.areaPx).filter((v): v is number => v !== undefined));
    if (typicalArea === undefined) return inside;
    return inside.filter((d) => (d.geometry?.areaPx ?? typicalArea) >= 0.5 * typicalArea);
  }

  private confidentFrames(track: GlobalTrack): number {
    let n = 0;
    for (const d of track.detections.values()) if ((d.confidence ?? 1) >= 0.5) n++;
    return n;
  }

  private trim(track: GlobalTrack): void {
    if (track.detections.size <= KEEP_FRAMES) return;
    const frames = [...track.detections.keys()].sort((a, b) => a - b);
    for (const f of frames.slice(0, frames.length - KEEP_FRAMES)) track.detections.delete(f);
  }

  /** Greedy one-to-one matching of chunk-local tracks to existing tracks of the same kind. */
  private associate(locals: LocalTrack[]): Map<LocalTrack, GlobalTrack> {
    const candidates: { local: LocalTrack; track: GlobalTrack; score: number }[] = [];
    for (const local of locals) {
      const firstFrame = Math.min(...local.detections.keys());
      for (const track of this.tracks.values()) {
        if (track.kind !== local.kind) continue;
        if (firstFrame - track.lastFrame > this.opts.lostAfterFrames) continue;
        const score = this.matchScore(local, track, firstFrame);
        if (score >= this.opts.matchThreshold) candidates.push({ local, track, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const out = new Map<LocalTrack, GlobalTrack>();
    const used = new Set<GlobalTrack>();
    for (const c of candidates) {
      if (out.has(c.local) || used.has(c.track)) continue;
      out.set(c.local, c.track);
      used.add(c.track);
    }
    return out;
  }

  private matchScore(local: LocalTrack, track: GlobalTrack, localFirstFrame: number): number {
    let sum = 0;
    let shared = 0;
    for (const [frame, d] of local.detections) {
      const g = track.detections.get(frame);
      if (!g) continue;
      sum += iou(d.box, g.box);
      shared++;
    }
    if (shared >= 2) return sum / shared;

    // No overlap to compare (SAM briefly lost the animal): compare where the track was last seen,
    // moved along its recent motion, with where the new local track starts.
    const history = [...track.detections.values()].sort((a, b) => a.frame - b.frame);
    const last = history.at(-1);
    const first = local.detections.get(localFirstFrame);
    if (!first || !last) return 0;
    // Velocity over ~0.5 s rather than one frame, which is dominated by mask jitter.
    const anchor = history.findLast((d) => d.frame <= last.frame - Math.max(3, this.opts.fps / 2));
    const predicted = anchor ? extrapolateBox(anchor.box, anchor.frame, last.box, last.frame, localFirstFrame) : last.box;

    const diag = (b: SamBox) => Math.hypot(b.right - b.left, b.bottom - b.top);
    const sizeRatio = diag(first.box) / Math.max(1, diag(last.box));
    if (sizeRatio < 0.5 || sizeRatio > 2) return 0;

    const a = boxCenter(predicted);
    const b = boxCenter(first.box);
    const closeness = Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y) / (0.5 * Math.max(diag(first.box), diag(last.box))));
    // Discounted so a real overlap match always wins over a prediction.
    return 0.8 * Math.max(iou(predicted, first.box), 0.75 * closeness);
  }
}
