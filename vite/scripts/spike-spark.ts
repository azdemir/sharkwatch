// Day-0 Muse Spark spike: verification accuracy/latency (crops vs crops + video) and grounding vs SAM.
//
// Usage: npm run spike:spark -- --clip clip-g-capistrano --chunk 0 [--concept shark] [--tracks 1] [--video] [--effort low] [--ground]

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { estimateLength } from '../src/shared/geo/gsd.ts';
import { groundObjects, verifyCandidate } from '../src/server/meta/spark.ts';
import { segmentVideo, type SamBox, type SamDetection } from '../src/server/meta/sam.ts';
import { clipDir, ensureChunks } from '../src/server/media/chunks.ts';
import { frameByIndex } from '../src/server/media/frames.ts';
import { ensureUploaded } from '../src/server/meta/files.ts';
import { maskGeometry } from '../src/server/pipeline/metrics.ts';
import { decodeMaskToRaster } from '@meta-sam/parser';
import { loadManifest, root, toDataUrl } from './lib/spike-common.ts';

const { values: args } = parseArgs({
  options: {
    clip: { type: 'string' },
    chunk: { type: 'string', default: '0' },
    concept: { type: 'string', default: 'shark' },
    video: { type: 'boolean', default: false },
    effort: { type: 'string', default: 'low' },
    ground: { type: 'boolean', default: false },
    tracks: { type: 'string', default: '1' },
  },
});
if (!args.clip) {
  console.error('Usage: npm run spike:spark -- --clip <clip-id> --chunk <k> [--video] [--ground]');
  process.exit(1);
}

const manifest = loadManifest(args.clip);
const chunk = manifest.chunks.find((c) => c.index === Number(args.chunk));
if (!chunk) throw new Error(`clip ${manifest.id} has no chunk ${args.chunk}`);
await ensureChunks(manifest, { log: console.log });
const chunkPath = join(clipDir(manifest.id), chunk.path);
const fileId = await ensureUploaded(chunkPath);

const sam = await segmentVideo({ video: { fileId }, concept: args.concept });
const byObject = new Map<string, SamDetection[]>();
for (const d of sam.detections) byObject.set(d.objectId, [...(byObject.get(d.objectId) ?? []), d]);
const tracks = [...byObject.values()].sort((a, b) => b.length - a.length).slice(0, Number(args.tracks));
if (tracks.length === 0) {
  console.log(`SAM found no "${args.concept}" in chunk ${chunk.index}; nothing to verify.`);
  process.exit(0);
}
const spikeDir = join(root, 'data', 'spike', manifest.id);
mkdirSync(spikeDir, { recursive: true });

async function crop(png: Buffer, box: SamBox): Promise<Buffer> {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const side = Math.max(160, Math.round(Math.max(w, h) * 2));
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const left = Math.max(0, Math.min(manifest.width - side, Math.round(cx - side / 2)));
  const top = Math.max(0, Math.min(manifest.height - side, Math.round(cy - side / 2)));
  return sharp(png).extract({ left, top, width: Math.min(side, manifest.width), height: Math.min(side, manifest.height) }).png().toBuffer();
}

const effort = args.effort as 'low' | 'medium' | 'high';
let mid: SamDetection | undefined;
let midPng: Buffer | undefined;
for (const track of tracks) {
  track.sort((a, b) => a.frameIndex - b.frameIndex);
  const picks = [track[0]!, track[Math.floor(track.length / 2)]!, track.at(-1)!];
  const crops = await Promise.all(picks.map(async (d) => crop(await frameByIndex(chunkPath, d.frameIndex), d.box)));
  const images = await Promise.all(crops.map((c) => toDataUrl(c, 512)));
  const center = picks[1]!;
  const centerPng = await frameByIndex(chunkPath, center.frameIndex);
  const b = center.box;
  const annotated = await sharp(centerPng)
    .composite([{ input: Buffer.from(`<svg width="${manifest.width}" height="${manifest.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${b.left}" y="${b.top}" width="${b.right - b.left}" height="${b.bottom - b.top}" fill="none" stroke="red" stroke-width="3"/></svg>`) }])
    .png()
    .toBuffer();
  images.push(await toDataUrl(annotated, 1024));
  // Keep what the model saw so a human can check its answer.
  await sharp(crops[1]!).resize(256, 256, { fit: 'inside' }).jpeg().toFile(join(spikeDir, `spark-${args.concept}-c${chunk.index}-obj${center.objectId}.jpg`));

  let measuredLength: { meters: number; low: number; high: number } | undefined;
  if (center.mask && center.maskBounds && manifest.scene?.gsd) {
    const geom = maskGeometry(decodeMaskToRaster(center.mask), center.mask.width, center.mask.height, center.maskBounds);
    if (geom) measuredLength = estimateLength(geom.majorAxisPx, manifest.scene.gsd);
  }

  const run = await verifyCandidate({ images, measuredLength, reasoningEffort: effort });
  const v = run.verification;
  const size = measuredLength ? `${measuredLength.meters.toFixed(1)} m` : '?';
  console.log(`#${center.objectId.padEnd(3)} ${String(track.length).padStart(2)} frames ${size.padStart(6)} → ${v.label} (${v.confidence.toFixed(2)}) ${v.species_guess ? `"${v.species_guess}" ` : ''}[${Math.round(run.latencyMs)} ms] ${v.evidence.slice(0, 2).join('; ')}`);
  if (args.video) {
    const withVideo = await verifyCandidate({ images, videoFileId: fileId, measuredLength, reasoningEffort: effort });
    console.log(`     + video → ${withVideo.verification.label} (${withVideo.verification.confidence.toFixed(2)}) [${Math.round(withVideo.latencyMs)} ms] ${withVideo.verification.behavior}`);
  }
  mid ??= center;
  midPng ??= centerPng;
}

if (args.ground && mid && midPng) {
  const grounded = await groundObjects(await toDataUrl(midPng, 1280), [args.concept]);
  const toPx = (o: (typeof grounded.objects)[number]) => ({
    left: (o.bbox.x_min * manifest.width) / 1000,
    top: (o.bbox.y_min * manifest.height) / 1000,
    right: (o.bbox.x_max * manifest.width) / 1000,
    bottom: (o.bbox.y_max * manifest.height) / 1000,
  });
  const iou = (p: SamBox, q: SamBox) => {
    const ix = Math.max(0, Math.min(p.right, q.right) - Math.max(p.left, q.left));
    const iy = Math.max(0, Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top));
    const inter = ix * iy;
    const area = (r: SamBox) => (r.right - r.left) * (r.bottom - r.top);
    return inter / (area(p) + area(q) - inter);
  };
  const samBoxes = sam.detections.filter((d) => d.frameIndex === mid.frameIndex).map((d) => d.box);
  console.log(`grounding: ${grounded.objects.length} object(s) in ${Math.round(grounded.latencyMs)} ms`);
  for (const o of grounded.objects) {
    const box = toPx(o);
    const best = Math.max(0, ...samBoxes.map((s) => iou(box, s)));
    console.log(`  ${o.object_name}: [${Object.values(box).map(Math.round).join(', ')}] best IoU vs SAM ${best.toFixed(2)}`);
  }
}
