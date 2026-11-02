// Turns a downloaded source video into the committed clip files:
//   data/clips/<id>/playback.mp4   CFR 30 fps, 720p short side; browser playback and the source of all analysis
//   data/clips/<id>/manifest.json  frame counts, chunk plan, attribution, scene data
// and builds/verifies the local analysis chunks (rebuilt automatically on other machines).
//
// Usage: npm run prepare-clip -- --id clip-g-capistrano --src data/raw/clip-g-capistrano/source.webm [--upload]
//   [--title "..."] [--url ...] [--author ...] [--license ...] [--start s] [--end s]
//   [--crop w:h:x:y]   (source pixels, applied before scaling; e.g. to cut out a window frame)
//   [--short-side 720] [--fps 10] [--chunk-frames 60] [--stride-frames 50]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { checkAlignment, chunkFileName, chunkPlan, clipDir, ensureChunks } from '../src/server/media/chunks.ts';
import { ffmpeg, H264, probeVideo } from '../src/server/media/ffmpeg.ts';
import type { ClipManifest } from '../src/shared/manifest.ts';

const { values: args } = parseArgs({
  options: {
    id: { type: 'string' },
    src: { type: 'string' },
    title: { type: 'string' },
    url: { type: 'string' },
    author: { type: 'string' },
    license: { type: 'string' },
    start: { type: 'string' },
    end: { type: 'string' },
    crop: { type: 'string' },
    'short-side': { type: 'string', default: '720' },
    fps: { type: 'string', default: '10' },
    'chunk-frames': { type: 'string', default: '60' },
    'stride-frames': { type: 'string', default: '50' },
    upload: { type: 'boolean', default: false },
  },
});

if (!args.id || !args.src) {
  console.error('Usage: npm run prepare-clip -- --id <clip-id> --src <video file> [--upload]');
  process.exit(1);
}

const PLAYBACK_FPS = 30;
const fps = Number(args.fps);
if (PLAYBACK_FPS % fps !== 0) throw new Error(`analysis fps must divide ${PLAYBACK_FPS}`);
const shortSide = Number(args['short-side']);

const dir = clipDir(args.id);
mkdirSync(dir, { recursive: true });
const playback = join(dir, 'playback.mp4');

// Scale the shorter side so portrait clips keep the same detail as landscape ones. Input-side
// seeking is frame-accurate when transcoding, and trims camera moves we can't model.
const source = await probeVideo(args.src);
const crop = args.crop?.split(':').map(Number);
if (crop && (crop.length !== 4 || crop.some((v) => !Number.isFinite(v)))) throw new Error('--crop must be w:h:x:y');
const [width, height] = crop ? [crop[0]!, crop[1]!] : [source.width, source.height];
const scale = width >= height ? `scale=-2:${shortSide}` : `scale=${shortSide}:-2`;
const trim = [...(args.start ? ['-ss', args.start] : []), ...(args.end ? ['-to', args.end] : [])];
console.log(`Encoding playback copy from ${source.width}x${source.height}${crop ? ` (crop ${width}x${height})` : ''}…`);
await ffmpeg([
  '-v', 'error', ...trim, '-i', args.src,
  '-vf', [`fps=${PLAYBACK_FPS}`, ...(crop ? [`crop=${args.crop}`] : []), scale].join(','),
  ...H264, '-crf', '20', '-r', String(PLAYBACK_FPS), '-movflags', '+faststart', playback,
]);

const playbackInfo = await probeVideo(playback);
const frameCount = Math.ceil(playbackInfo.frames / (PLAYBACK_FPS / fps));
const chunkFrames = Number(args['chunk-frames']);
const strideFrames = Number(args['stride-frames']);

function editsNote(): string | undefined {
  const notes = [
    ...(args.start || args.end ? [`trimmed to ${args.start ?? '0'}–${args.end ?? 'end'} s`] : []),
    ...(crop ? [`cropped to ${width}×${height} at (${crop[2]}, ${crop[3]})`] : []),
  ];
  return notes.length ? `${notes.join('; ')}; re-encoded at ${PLAYBACK_FPS} fps, ${shortSide}p` : undefined;
}

const manifestPath = join(dir, 'manifest.json');
const previous: ClipManifest | undefined = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : undefined;

const manifest: ClipManifest = {
  id: args.id,
  title: args.title ?? previous?.title ?? args.id,
  source: {
    file: relative(process.cwd(), args.src),
    url: args.url ?? previous?.source.url,
    author: args.author ?? previous?.source.author,
    license: args.license ?? previous?.source.license,
    edits: editsNote() ?? previous?.source.edits,
  },
  fps,
  playbackFps: PLAYBACK_FPS,
  width: playbackInfo.width,
  height: playbackInfo.height,
  frameCount,
  durationS: frameCount / fps,
  chunkFrames,
  strideFrames,
  chunks: chunkPlan(frameCount, chunkFrames, strideFrames).map((c) => ({
    ...c,
    path: `chunks/${chunkFileName(c.index)}`,
  })),
  scene: previous?.scene,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Playback: ${playbackInfo.frames} frames at ${playbackInfo.width}x${playbackInfo.height} → ${frameCount} analysis frames`);

const paths = await ensureChunks(manifest, { force: true, log: console.log });
for (const c of manifest.chunks) console.log(`  chunk ${c.index}: frames ${c.startFrame}–${c.startFrame + c.frameCount - 1}`);

for (const s of await checkAlignment(manifest)) {
  if (s.alignedDb < s.neighbourDb - 1) {
    throw new Error(`frame alignment check failed at g=${s.analysisFrame}: ${s.alignedDb.toFixed(1)} dB vs ${s.neighbourDb.toFixed(1)} dB`);
  }
  const note = s.alignedDb - s.neighbourDb < 3 ? ' — low motion or duplicated frames; inconclusive here' : '';
  console.log(`  alignment g=${s.analysisFrame} ↔ p=${s.playbackFrame}: ${s.alignedDb.toFixed(1)} dB (neighbours ${s.neighbourDb.toFixed(1)} dB)${note}`);
}

if (args.upload) {
  const { ensureUploaded } = await import('../src/server/meta/files.ts');
  for (const [i, path] of paths.entries()) console.log(`  chunk ${i} → ${await ensureUploaded(path)}`);
}

console.log(`Wrote ${relative(process.cwd(), manifestPath)} (${manifest.chunks.length} chunks)`);
