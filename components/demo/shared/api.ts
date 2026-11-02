// HTTP response shapes shared by the server and the web app.

import type { ClipScene } from './manifest.ts';

export interface HealthInfo {
  ok: boolean;
  live: boolean;
  uploads?: boolean;
  livePasscodeRequired: boolean;
  telegram: boolean;
}

export interface ClipInfo {
  id: string;
  title: string;
  durationS: number;
  width: number;
  height: number;
  fps: number;
  playbackFps: number;
  playbackUrl: string;
  source: { url?: string; author?: string; license?: string };
  scene: ClipScene | null;
  demo: boolean;
}

export interface RecordingInfo {
  /** Path relative to data/sessions, e.g. "golden/clip-b-swimmer". */
  id: string;
  clipId: string;
  golden: boolean;
}

export interface StartedSession {
  sessionId: string;
  mode: 'live' | 'replay';
  clipId: string;
}
