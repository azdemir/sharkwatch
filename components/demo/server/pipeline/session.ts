// Runs one patrol session over a clip: chunks are "captured" in real time (or as fast as possible),
// segmented by SAM, tracked strictly in chunk order, and newly confirmed animals are verified by
// Muse Spark in one batched call per chunk. Everything is emitted on an EventBus.
//
// Meta Model API processes one request per key at a time (measured: three concurrent SAM requests
// finish at ~4, ~8 and ~12 s), so chunks run one after another; sending more at once only queues.

import { join } from 'node:path';
import { CONFIRM_FRAMES, type Concept, type TrackSummary } from '../../shared/events.ts';
import type { ClipChunk, ClipManifest } from '../../shared/manifest.ts';
import { clipDir, ensureChunks } from '../media/chunks.ts';
import type { EventBus } from '../events/bus.ts';
import { localTracksFrom, mergeConcepts, type LocalTrack } from './detections.ts';
import { BudgetExceededError, SAM_USD_PER_FRAME, type SamSource } from './sam-source.ts';
import { sceneFor } from './scene.ts';
import { Tracker } from './tracker.ts';
import type { TrackVerifier } from './verifier.ts';

const SPARK_USD_PER_INPUT_TOKEN = 1.25 / 1e6;
const SPARK_USD_PER_OUTPUT_TOKEN = 4.25 / 1e6;

/**
 * `thorough` runs every prompt on every chunk (best recall; for recordings).
 * `live` runs `shark` + `person` and adds the generic `fish` net only when `shark` finds nothing,
 * which roughly halves SAM time per chunk.
 */
export type PromptPolicy = 'thorough' | 'live';

export interface SessionOptions {
  manifest: ClipManifest;
  bus: EventBus;
  sam: SamSource;
  /** Null skips verification (tracks stay "pending"). */
  verifier: TrackVerifier | null;
  /** Directory for evidence snapshots. */
  sessionDir: string;
  /** Wait for each chunk to be "captured" before sending it, as a live drone would. */
  realtime: boolean;
  prompts?: PromptPolicy;
  /** In real-time mode, skip chunks that fall further behind than this to stay current. */
  maxLagS?: number;
  mode?: 'live' | 'replay';
  signal?: AbortSignal;
  /** Directory holding this manifest's playback.mp4. Default: data/clips/<id>.
   * The upload route passes its data/uploads/<id> directory here. */
  dir?: string;
}

export interface SessionResult {
  tracks: TrackSummary[];
  costUsd: number;
  reason: 'completed' | 'error' | 'budget';
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

/** Frame at which a track had been seen in enough confident frames to count as real. */
function confirmedAt(detections: { frame: number; confidence?: number }[], notBefore: number): number {
  const confident = detections.filter((d) => (d.confidence ?? 1) >= 0.5);
  const at = confident[Math.min(CONFIRM_FRAMES, confident.length) - 1]?.frame ?? detections[0]?.frame ?? notBefore;
  return Math.max(at, notBefore);
}

export async function runSession(options: SessionOptions): Promise<SessionResult> {
  const { manifest, bus, sam, verifier, realtime, signal } = options;
  const policy = options.prompts ?? 'thorough';
  const maxLagS = options.maxLagS ?? 45;
  const scene = sceneFor(manifest);
  const tracker = new Tracker({ fps: manifest.fps, scene, frame: { width: manifest.width, height: manifest.height } });
  let costUsd = 0;

  bus.emit({
    type: 'session.started',
    clipId: manifest.id,
    mode: options.mode ?? 'live',
    fps: manifest.fps,
    playbackFps: manifest.playbackFps,
    width: manifest.width,
    height: manifest.height,
    frameCount: manifest.frameCount,
    beachName: scene?.beachName,
  });
  if (!scene) bus.emit({ type: 'warning', message: `${manifest.id} has no scene data; positions and sizes are unavailable` });

  await ensureChunks(manifest, options.dir ? { dir: options.dir } : {});
  const dir = options.dir ?? clipDir(manifest.id);
  const pathOf = (c: ClipChunk) => join(dir, c.path);
  const capturedAtS = (c: ClipChunk) => (c.startFrame + c.frameCount) / manifest.fps;
  const startedAt = performance.now();
  const elapsedS = () => (performance.now() - startedAt) / 1000;

  const verifications: Promise<void>[] = [];
  let reason: SessionResult['reason'] = 'completed';

  const segmentAll = async (chunk: ClipChunk, concepts: Concept[]) =>
    Promise.all(
      concepts.map(async (concept) => {
        try {
          return { concept, result: await sam.segment(chunk, pathOf(chunk), concept) };
        } catch (error) {
          return { concept, error: error as Error };
        }
      }),
    );

  for (const [i, chunk] of manifest.chunks.entries()) {
    if (signal?.aborted) {
      reason = 'error';
      break;
    }
    if (realtime) {
      await sleep((capturedAtS(chunk) - elapsedS()) * 1000, signal);
      // Falling behind: drop this chunk if the next one is already captured and we're too late.
      const next = manifest.chunks[i + 1];
      if (next && elapsedS() - capturedAtS(chunk) > maxLagS && elapsedS() >= capturedAtS(next)) {
        bus.emit({ type: 'warning', message: `skipped chunk ${chunk.index} to stay within ${maxLagS}s of live` });
        continue;
      }
    }

    const runs = await segmentAll(chunk, policy === 'live' ? ['shark', 'person'] : ['shark', 'fish', 'person']);
    if (policy === 'live') {
      const sharkRun = runs.find((r) => r.concept === 'shark');
      if (!sharkRun?.result || sharkRun.result.detections.length === 0) runs.push(...(await segmentAll(chunk, ['fish'])));
    }

    const byConcept: Partial<Record<Concept, LocalTrack[]>> = {};
    const samMs: Partial<Record<Concept, number>> = {};
    let framesBilled = 0;
    for (const run of runs) {
      if (run.error) {
        if (run.error instanceof BudgetExceededError) reason = 'budget';
        bus.emit({ type: 'warning', message: `chunk ${chunk.index} "${run.concept}": ${run.error.message}` });
        continue;
      }
      byConcept[run.concept] = localTracksFrom(run.concept, run.result!.detections, chunk.startFrame);
      samMs[run.concept] = Math.round(run.result!.ms);
      framesBilled += run.result!.framesBilled;
    }
    if (reason === 'budget') break;

    const ingest = tracker.ingest(chunk, mergeConcepts(byConcept));
    costUsd += framesBilled * SAM_USD_PER_FRAME;
    bus.emit({ type: 'frames', chunk: chunk.index, frames: ingest.frames });
    for (const track of ingest.updated) bus.emit({ type: 'track.updated', track });
    bus.emit({
      type: 'chunk.timing',
      timing: { chunk: chunk.index, samMs, framesBilled, lagS: realtime ? Math.max(0, elapsedS() - capturedAtS(chunk)) : 0 },
      costUsd,
    });

    if (!verifier || ingest.toVerify.length === 0) continue;
    // Sent before the next chunk's SAM requests, so verdicts (and alerts) aren't queued behind them.
    const candidates = ingest.toVerify.map((trackId) => {
      const verifying = tracker.setVerdict(trackId, 'verifying');
      if (verifying) bus.emit({ type: 'track.updated', track: verifying });
      const all = tracker.detectionsOf(trackId);
      const detections = all.filter((d) => d.frame >= chunk.startFrame && d.frame < chunk.startFrame + chunk.frameCount);
      return { trackId, detections, length: tracker.summary(trackId)?.length, readyFrame: confirmedAt(all, chunk.startFrame) };
    });
    verifications.push(
      verifier
        .verify({
          candidates,
          chunkPath: pathOf(chunk),
          chunkStartFrame: chunk.startFrame,
          frame: { width: manifest.width, height: manifest.height },
          evidenceDir: join(options.sessionDir, 'evidence'),
          people: tracker.peopleDetections(chunk.startFrame, chunk.startFrame + chunk.frameCount),
        })
        .then(
          ({ outcomes, usage }) => {
            if (usage) costUsd += usage.inputTokens * SPARK_USD_PER_INPUT_TOKEN + usage.outputTokens * SPARK_USD_PER_OUTPUT_TOKEN;
            for (const { trackId } of candidates) {
              const outcome = outcomes.get(trackId);
              const track = outcome
                ? tracker.setVerdict(trackId, outcome.verdict, outcome.verification, `evidence/${outcome.evidenceFile}`)
                : tracker.setVerdict(trackId, 'uncertain');
              if (track) bus.emit({ type: 'track.updated', track });
            }
          },
          (error: Error) => {
            bus.emit({ type: 'warning', message: `verification of ${candidates.map((c) => c.trackId).join(', ')} failed: ${error.message}` });
            for (const { trackId } of candidates) {
              const track = tracker.setVerdict(trackId, 'uncertain');
              if (track) bus.emit({ type: 'track.updated', track });
            }
          },
        ),
    );
  }

  await Promise.all(verifications);
  bus.emit({ type: 'session.ended', reason, costUsd });
  return { tracks: tracker.summaries(), costUsd, reason };
}
