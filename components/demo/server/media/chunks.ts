// Analysis chunks are rebuilt locally from the committed playback copy, so a fresh checkout needs
// only playback.mp4 + manifest.json. Taking every Nth playback frame keeps analysis frame g exactly
// on playback frame g*N by construction.

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ClipChunk, ClipManifest } from '../../shared/manifest.ts';
import { ffmpeg, framePsnr, H264, probeVideo } from './ffmpeg.ts';

export const DATA_DIR = join(process.cwd(), 'data');

export function clipDir(clipId: string): string {
  return join(DATA_DIR, 'clips', clipId);
}

/**
 * Overlapping chunk windows over `frameCount` analysis frames. SAM bills at least 50 frames per
 * request, so a short tail is re-anchored to end on the last frame: same cost, more overlap.
 */
export function chunkPlan(frameCount: number, chunkFrames: number, strideFrames: number): Omit<ClipChunk, 'path'>[] {
  if (strideFrames >= chunkFrames) throw new RangeError('stride must be smaller than chunk length so chunks overlap');
  const overlap = chunkFrames - strideFrames;
  const starts: number[] = [];
  for (let start = 0; start === 0 || start < frameCount - overlap; start += strideFrames) starts.push(start);
  const last = starts.length - 1;
  if (last > 0) starts[last] = Math.max(0, Math.min(starts[last]!, frameCount - chunkFrames));
  return starts.map((startFrame, index) => ({
    index,
    startFrame,
    frameCount: Math.min(chunkFrames, frameCount - startFrame),
  }));
}

export function chunkFileName(index: number): string {
  return `chunk-${String(index).padStart(3, '0')}.mp4`;
}

export interface BuildOptions {
  /** Rebuild even if the chunk files already exist. */
  force?: boolean;
  log?: (line: string) => void;
  /** Directory holding playback.mp4 for this manifest. Default: data/clips/<id>.
   * Uploaded footage lives under data/uploads/<id> instead, so the upload route
   * passes its directory here; committed clips keep the default. */
  dir?: string;
}

/** Builds in flight in this process, so concurrent sessions on one clip share a single build. */
const building = new Map<string, Promise<string[]>>();

/** Builds analysis.mp4 and the chunk files for a clip if they are missing; returns absolute chunk paths. */
export function ensureChunks(manifest: ClipManifest, options: BuildOptions = {}): Promise<string[]> {
  const dir = options.dir ?? clipDir(manifest.id);
  const paths = manifest.chunks.map((c) => join(dir, c.path));
  const playback = join(dir, 'playback.mp4');
  const upToDate = () => paths.every((p) => existsSync(p) && statSync(p).mtimeMs >= statSync(playback).mtimeMs);
  if (!options.force && upToDate()) return Promise.resolve(paths);

  const key = options.dir ? `${manifest.id}:${options.dir}` : manifest.id;
  const inFlight = building.get(key);
  if (inFlight && !options.force) return inFlight;
  const build = buildChunks(manifest, paths, upToDate, options.log ?? (() => {}), dir).finally(() => building.delete(key));
  building.set(key, build);
  return build;
}

/**
 * Builds into a private temporary folder and then moves the result into place, so other processes
 * building the same clip at the same time (test workers, a second server) never read half-written
 * files. Whichever finishes first wins; both produce the same frames.
 */
async function buildChunks(manifest: ClipManifest, paths: string[], upToDate: () => boolean, log: (line: string) => void, dir: string): Promise<string[]> {
  const playback = join(dir, 'playback.mp4');
  const decimation = manifest.playbackFps / manifest.fps;
  if (!Number.isInteger(decimation)) throw new Error(`${manifest.id}: playback fps must be a multiple of analysis fps`);

  const tmp = join(dir, `.build-${process.pid}-${randomUUID().slice(0, 8)}`);
  const tmpChunks = join(tmp, 'chunks');
  const tmpAnalysis = join(tmp, 'analysis.mp4');
  mkdirSync(tmpChunks, { recursive: true });
  try {
    log(`${manifest.id}: building analysis copy (every ${decimation}th playback frame)…`);
    await ffmpeg([
      '-v', 'error',
      '-i', playback,
      '-vf', `select='not(mod(n\\,${decimation}))',setpts=N/(${manifest.fps}*TB)`,
      ...H264, '-crf', '18', '-r', String(manifest.fps), tmpAnalysis,
    ]);
    const info = await probeVideo(tmpAnalysis);
    if (info.frames !== manifest.frameCount) {
      throw new Error(`${manifest.id}: analysis has ${info.frames} frames, manifest expects ${manifest.frameCount}`);
    }

    for (const chunk of manifest.chunks) {
      const out = join(tmpChunks, chunkFileName(chunk.index));
      const end = chunk.startFrame + chunk.frameCount;
      await ffmpeg([
        '-v', 'error',
        '-i', tmpAnalysis,
        '-vf', `trim=start_frame=${chunk.startFrame}:end_frame=${end},setpts=PTS-STARTPTS`,
        ...H264, '-crf', '18', '-r', String(manifest.fps), '-movflags', '+faststart',
        out,
      ]);
      const counted = (await probeVideo(out)).frames;
      if (counted !== chunk.frameCount) {
        throw new Error(`${manifest.id} chunk ${chunk.index}: expected ${chunk.frameCount} frames, got ${counted}`);
      }
    }

    // Publish. If another builder got there first, keep theirs.
    if (!upToDate()) {
      rmSync(join(dir, 'chunks'), { recursive: true, force: true });
      try {
        renameSync(tmpChunks, join(dir, 'chunks'));
      } catch (error) {
        if (!upToDate()) throw error;
      }
      renameSync(tmpAnalysis, join(dir, 'analysis.mp4'));
    }
    log(`${manifest.id}: ${paths.length} chunks ready`);
    return paths;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export interface AlignmentSample {
  analysisFrame: number;
  playbackFrame: number;
  alignedDb: number;
  neighbourDb: number;
}

/**
 * Compares analysis frame g with playback frame g*N and its neighbours. A real misalignment scores
 * ~15 dB below a neighbour; sources under 30 fps contain duplicated frames, so near-ties are expected.
 */
export async function checkAlignment(manifest: ClipManifest): Promise<AlignmentSample[]> {
  const dir = clipDir(manifest.id);
  const playback = join(dir, 'playback.mp4');
  const analysis = join(dir, 'analysis.mp4');
  const decimation = manifest.playbackFps / manifest.fps;
  const samples: AlignmentSample[] = [];
  for (const g of [1, Math.floor(manifest.frameCount / 2), manifest.frameCount - 2].filter((g) => g > 0)) {
    const p = g * decimation;
    const alignedDb = await framePsnr(analysis, g, playback, p);
    const neighbourDb = Math.max(await framePsnr(analysis, g, playback, p - 1), await framePsnr(analysis, g, playback, p + 1));
    samples.push({ analysisFrame: g, playbackFrame: p, alignedDb, neighbourDb });
  }
  return samples;
}
