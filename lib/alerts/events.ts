// Moved from sharkwatch-vite/src/shared/events.ts (import path adjusted for Next.js).
// Types shared by the pipeline, the server and the web app. Everything here is plain JSON so a
// recorded session (JSONL) replays exactly like a live one.

import type { AlertJson } from './alerts';

export type Concept = 'shark' | 'fish' | 'person';
export type TrackKind = 'animal' | 'person';
export type BoxJson = [number, number, number, number];

export interface FrameObject {
  trackId: string;
  kind: TrackKind;
  box: BoxJson;
  confidence?: number;
  maskPath?: string;
  maskSize?: [number, number];
}

export interface FrameDetections {
  frame: number;
  objects: FrameObject[];
}

export type TrackLifecycle = 'tentative' | 'active' | 'lost';
export type TrackVerdict = 'pending' | 'verifying' | 'shark' | 'not_shark' | 'uncertain' | 'too_small';

export interface LengthJson {
  meters: number;
  low: number;
  high: number;
  sizeClass: 'small' | 'medium' | 'large';
  reliable?: boolean;
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
  bodies_in_outline?: number;
  basedOnFrame?: number;
  latencyMs: number;
}

export const CONFIRM_FRAMES = 8;

export interface TrackSummary {
  id: string;
  kind: TrackKind;
  lifecycle: TrackLifecycle;
  verdict?: TrackVerdict;
  verification?: VerificationJson;
  concepts: Concept[];
  firstFrame: number;
  lastFrame: number;
  framesSeen: number;
  meanConfidence?: number;
  length?: LengthJson;
  position?: { lat: number; lon: number };
  speedMps?: number;
  headingDeg?: number;
  distanceToShoreM?: number;
  shoreApproachMps?: number;
  nearestPersonM?: number;
  inSwimZone?: boolean;
  evidence?: string;
}

export interface ChunkTiming {
  chunk: number;
  samMs: Partial<Record<Concept, number>>;
  framesBilled: number;
  lagS: number;
}

export type SessionEventBody =
  | { type: 'session.started'; clipId: string; mode: 'live' | 'replay'; fps: number; playbackFps: number; width: number; height: number; frameCount: number; beachName?: string }
  | { type: 'frames'; chunk: number; frames: FrameDetections[] }
  | { type: 'track.updated'; track: TrackSummary }
  | { type: 'chunk.timing'; timing: ChunkTiming; costUsd: number }
  | { type: 'alert.updated'; alert: AlertJson }
  | { type: 'warning'; message: string }
  | { type: 'session.ended'; reason: 'completed' | 'error' | 'budget'; message?: string; costUsd: number };

export type SessionEvent = SessionEventBody & { sessionId: string; seq: number; t: number };
