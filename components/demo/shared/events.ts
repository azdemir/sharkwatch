// Types shared by the pipeline, the server and the web app. Everything here is plain JSON so a
// recorded session (JSONL) replays exactly like a live one.

import type { AlertJson } from './alerts.ts';

export type Concept = 'shark' | 'fish' | 'person';
export type TrackKind = 'animal' | 'person';

/** [left, top, right, bottom] in analysis pixels, half-open. */
export type BoxJson = [number, number, number, number];

export interface FrameObject {
  trackId: string;
  kind: TrackKind;
  box: BoxJson;
  confidence?: number;
  /** Mask outline as an SVG path in raster space; draw with translate(left, top) scale(boxW/w, boxH/h). */
  maskPath?: string;
  /** Mask raster [width, height]. */
  maskSize?: [number, number];
}

export interface FrameDetections {
  /** Global analysis frame; playback time = frame / fps. */
  frame: number;
  objects: FrameObject[];
}

/** Whether a track is currently on screen. */
export type TrackLifecycle = 'tentative' | 'active' | 'lost';

/**
 * Muse Spark's call on an animal track. `too_small` marks generic-prompt candidates below the
 * size worth assessing (small fish); they are never sent for verification.
 */
export type TrackVerdict = 'pending' | 'verifying' | 'shark' | 'not_shark' | 'uncertain' | 'too_small';

export interface LengthJson {
  meters: number;
  low: number;
  high: number;
  sizeClass: 'small' | 'medium' | 'large';
  /** False when the outline covers more than one animal, so the length overstates one body. */
  reliable?: boolean;
  /** Why: Muse Spark counted several bodies, or the outline's length swings more than twofold. */
  unreliableReason?: 'merged' | 'unstable';
}

export interface VerificationJson {
  is_shark: boolean;
  label: string;
  confidence: number;
  species_guess: string;
  species_confidence: 'low' | 'medium' | 'high';
  behavior: string;
  evidence: string[];
  /** Distinct bodies Muse Spark counted inside the traced outline (absent in older recordings). */
  bodies_in_outline?: number;
  /** Latest analysis frame Muse Spark was shown for this verdict, so a replay never shows a verdict
   * before the footage it was based on (absent in older recordings). */
  basedOnFrame?: number;
  latencyMs: number;
}

/** Frames a track must be seen in before it counts as real: one-off flickers (a wave read as a
 * swimmer, say) never become tracks, alert inputs or distance lines. */
export const CONFIRM_FRAMES = 8;

export interface TrackSummary {
  id: string;
  kind: TrackKind;
  lifecycle: TrackLifecycle;
  /** Animals only. */
  verdict?: TrackVerdict;
  verification?: VerificationJson;
  /** SAM prompts that found this track. */
  concepts: Concept[];
  firstFrame: number;
  lastFrame: number;
  framesSeen: number;
  meanConfidence?: number;
  length?: LengthJson;
  position?: { lat: number; lon: number };
  /** Hidden when the camera moves, since ground speed can't be separated from camera motion. */
  speedMps?: number;
  headingDeg?: number;
  distanceToShoreM?: number;
  /** Positive when closing on the shore. */
  shoreApproachMps?: number;
  nearestPersonM?: number;
  inSwimZone?: boolean;
  /** Evidence snapshot path relative to the session directory. */
  evidence?: string;
}

export interface ChunkTiming {
  chunk: number;
  /** Per-prompt SAM latency in ms. */
  samMs: Partial<Record<Concept, number>>;
  framesBilled: number;
  /** Seconds between the chunk's last frame being "captured" and its results being ready. */
  lagS: number;
}

export type SessionEventBody =
  | {
      type: 'session.started';
      clipId: string;
      mode: 'live' | 'replay';
      fps: number;
      playbackFps: number;
      width: number;
      height: number;
      frameCount: number;
      beachName?: string;
    }
  | { type: 'frames'; chunk: number; frames: FrameDetections[] }
  | { type: 'track.updated'; track: TrackSummary }
  | { type: 'chunk.timing'; timing: ChunkTiming; costUsd: number }
  | { type: 'alert.updated'; alert: AlertJson }
  | { type: 'warning'; message: string }
  | { type: 'session.ended'; reason: 'completed' | 'error' | 'budget' | 'stopped'; message?: string; costUsd: number };

export type SessionEvent = SessionEventBody & {
  sessionId: string;
  seq: number;
  /** Seconds since the session started. */
  t: number;
};
