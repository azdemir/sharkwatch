// Where a session gets SAM results from: the live API (billed, raw output saved for later), or a
// previous session's saved raw output (free, deterministic; for tests and tuning the tracker).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.ts';
import type { Concept } from '../../shared/events.ts';
import type { ClipChunk } from '../../shared/manifest.ts';
import { ensureUploaded } from '../meta/files.ts';
import { detectionsFrom, parseRawOutput, segmentVideo, type SamDetection } from '../meta/sam.ts';

export const SAM_USD_PER_FRAME = 0.2 / 1000;
export const SAM_MIN_FRAMES = 50;

export interface SamChunkResult {
  detections: SamDetection[];
  ms: number;
  framesBilled: number;
}

export interface SamSource {
  segment(chunk: ClipChunk, chunkPath: string, concept: Concept): Promise<SamChunkResult>;
}

export class BudgetExceededError extends Error {}

/** Frames billed by this process across all sessions, checked against FRAME_BUDGET. */
let framesBilledInProcess = 0;

export function rawFileName(chunkIndex: number, concept: Concept): string {
  return `c${String(chunkIndex).padStart(3, '0')}-${concept}.txt`;
}

export class LiveSamSource implements SamSource {
  constructor(private readonly rawDir?: string) {
    if (rawDir) mkdirSync(rawDir, { recursive: true });
  }

  async segment(chunk: ClipChunk, chunkPath: string, concept: Concept): Promise<SamChunkResult> {
    const expected = Math.max(SAM_MIN_FRAMES, chunk.frameCount);
    if (framesBilledInProcess + expected > config.frameBudget) {
      throw new BudgetExceededError(`frame budget of ${config.frameBudget} reached (FRAME_BUDGET)`);
    }
    framesBilledInProcess += expected;

    const fileId = await ensureUploaded(chunkPath);
    const run = await segmentVideo({ video: { fileId }, concept });
    const framesBilled = run.framesBilled ?? expected;
    framesBilledInProcess += framesBilled - expected;
    if (this.rawDir) writeFileSync(join(this.rawDir, rawFileName(chunk.index, concept)), run.result.rawOutput);
    return { detections: run.detections, ms: run.timing.totalMs, framesBilled };
  }
}

export class RecordedSamSource implements SamSource {
  constructor(private readonly rawDir: string) {}

  async segment(chunk: ClipChunk, _chunkPath: string, concept: Concept): Promise<SamChunkResult> {
    const path = join(this.rawDir, rawFileName(chunk.index, concept));
    if (!existsSync(path)) throw new Error(`no recorded SAM output at ${path}`);
    const result = await parseRawOutput(readFileSync(path, 'utf8'));
    return { detections: detectionsFrom(result), ms: 0, framesBilled: 0 };
  }
}
