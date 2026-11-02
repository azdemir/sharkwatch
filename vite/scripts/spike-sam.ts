// Day-0 SAM spike: recall, false positives, latency and coordinate checks on prepared chunks.
//
// Usage: npm run spike:sam -- --clip clip-g-capistrano [--chunks 0,1,2] [--concepts shark,person,swimmer,surfer]
//          [--parallel] [--no-overlays]
// Writes: tests/fixtures/sam/<clip>-c<k>-<concept>.txt  (raw SAM output, used as test fixtures)
//         data/spike/<clip>/*.png                        (overlay checks)
//         data/spike/<clip>/sam-summary.json

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { clipDir, ensureChunks } from '../src/server/media/chunks.ts';
import { ensureUploaded } from '../src/server/meta/files.ts';
import { segmentVideo, type SamVideoRun } from '../src/server/meta/sam.ts';
import { frameByIndex } from '../src/server/media/frames.ts';
import type { ClipChunk } from '../src/shared/manifest.ts';
import { loadManifest, percentile, renderOverlay, root } from './lib/spike-common.ts';

const { values: args } = parseArgs({
  options: {
    clip: { type: 'string' },
    chunks: { type: 'string', default: '0' },
    concepts: { type: 'string', default: 'shark,person' },
    parallel: { type: 'boolean', default: false },
    'no-overlays': { type: 'boolean', default: false },
  },
});
if (!args.clip) {
  console.error('Usage: npm run spike:sam -- --clip <clip-id> [--chunks 0,1] [--concepts shark,person]');
  process.exit(1);
}

const manifest = loadManifest(args.clip);
const concepts = args.concepts.split(',').map((c) => c.trim()).filter(Boolean);
const chunkIds = args.chunks === 'all' ? manifest.chunks.map((c) => c.index) : args.chunks.split(',').map(Number);
const chunks = chunkIds.map((i) => {
  const chunk = manifest.chunks.find((c) => c.index === i);
  if (!chunk) throw new Error(`clip ${manifest.id} has no chunk ${i}`);
  return chunk;
});

await ensureChunks(manifest, { log: console.log });
const chunkPath = (chunk: ClipChunk) => join(clipDir(manifest.id), chunk.path);
const fileIds = new Map<number, string>();
for (const chunk of chunks) fileIds.set(chunk.index, await ensureUploaded(chunkPath(chunk)));

const spikeDir = join(root, 'data', 'spike', manifest.id);
const fixtureDir = join(root, 'tests', 'fixtures', 'sam');
mkdirSync(spikeDir, { recursive: true });
mkdirSync(fixtureDir, { recursive: true });

interface RunSummary {
  chunk: number;
  concept: string;
  framesSent: number;
  framesWithDetections: number;
  objects: number;
  maxObjectsPerFrame: number;
  firstDetectionFrame: number | null;
  meanConfidence: number | null;
  minConfidence: number | null;
  firstFrameMs?: number;
  totalMs: number;
  framesBilled?: number;
  outcome: string;
  diagnostics: number;
  maskVsBoxSize: string[];
}

function summarize(chunk: ClipChunk, run: SamVideoRun): RunSummary {
  const perFrame = new Map<number, number>();
  for (const d of run.detections) perFrame.set(d.frameIndex, (perFrame.get(d.frameIndex) ?? 0) + 1);
  const confidences = run.detections.map((d) => d.confidence).filter((c): c is number => c !== undefined);
  const sizes = new Set<string>();
  for (const d of run.detections.slice(0, 5)) {
    if (d.mask && d.maskBounds) {
      sizes.add(`box ${d.maskBounds.right - d.maskBounds.left}x${d.maskBounds.bottom - d.maskBounds.top} / mask ${d.mask.width}x${d.mask.height}`);
    }
  }
  return {
    chunk: chunk.index,
    concept: run.concept,
    framesSent: chunk.frameCount,
    framesWithDetections: perFrame.size,
    objects: new Set(run.detections.map((d) => d.objectId)).size,
    maxObjectsPerFrame: Math.max(0, ...perFrame.values()),
    firstDetectionFrame: perFrame.size ? Math.min(...perFrame.keys()) : null,
    meanConfidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
    minConfidence: confidences.length ? Math.min(...confidences) : null,
    firstFrameMs: run.timing.firstFrameMs,
    totalMs: run.timing.totalMs,
    framesBilled: run.framesBilled,
    outcome: run.result.outcome.status,
    diagnostics: run.result.diagnostics.length,
    maskVsBoxSize: [...sizes],
  };
}

async function runChunk(chunk: ClipChunk): Promise<RunSummary[]> {
  const runs = await Promise.all(
    concepts.map((concept) => segmentVideo({ video: { fileId: fileIds.get(chunk.index)! }, concept })),
  );
  const out: RunSummary[] = [];
  for (const run of runs) {
    const tag = `${manifest.id}-c${chunk.index}-${run.concept.replace(/\W+/g, '_')}`;
    writeFileSync(join(fixtureDir, `${tag}.txt`), run.result.rawOutput);
    const summary = summarize(chunk, run);
    out.push(summary);

    if (!args['no-overlays'] && run.detections.length) {
      const frames = [...new Set(run.detections.map((d) => d.frameIndex))].sort((a, b) => a - b);
      const picks = [...new Set([frames[0]!, frames[Math.floor(frames.length / 2)]!, frames.at(-1)!])];
      for (const f of picks) {
        const png = await frameByIndex(chunkPath(chunk), f);
        const overlay = await renderOverlay(png, run.detections.filter((d) => d.frameIndex === f));
        writeFileSync(join(spikeDir, `${tag}-f${String(f).padStart(3, '0')}.png`), overlay);
      }
    }
  }
  return out;
}

const startedAt = performance.now();
const summaries: RunSummary[] = [];
if (args.parallel) {
  // Mirrors the server: up to 3 chunks in flight, each with all concepts in parallel.
  const queue = [...chunks];
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let chunk = queue.shift(); chunk; chunk = queue.shift()) summaries.push(...(await runChunk(chunk)));
    }),
  );
} else {
  for (const chunk of chunks) summaries.push(...(await runChunk(chunk)));
}
const wallMs = performance.now() - startedAt;

summaries.sort((a, b) => a.chunk - b.chunk || a.concept.localeCompare(b.concept));
console.table(
  summaries.map((s) => ({
    chunk: s.chunk,
    concept: s.concept,
    'frames hit': `${s.framesWithDetections}/${s.framesSent}`,
    objects: s.objects,
    'max/frame': s.maxObjectsPerFrame,
    'first hit': s.firstDetectionFrame,
    'conf mean': s.meanConfidence?.toFixed(2),
    'conf min': s.minConfidence?.toFixed(2),
    'first ms': s.firstFrameMs?.toFixed(0),
    'total ms': s.totalMs.toFixed(0),
    billed: s.framesBilled,
    outcome: s.outcome,
  })),
);
const totals = summaries.map((s) => s.totalMs);
const firsts = summaries.map((s) => s.firstFrameMs).filter((v): v is number => v !== undefined);
const latency = {
  totalP50: percentile(totals, 50),
  totalP95: percentile(totals, 95),
  firstFrameP50: percentile(firsts, 50),
  firstFrameP95: percentile(firsts, 95),
  wallMs,
};
console.log('latency (ms):', Object.fromEntries(Object.entries(latency).map(([k, v]) => [k, Math.round(v)])));
console.log('mask vs box sizes:', [...new Set(summaries.flatMap((s) => s.maskVsBoxSize))].slice(0, 6));
writeFileSync(join(spikeDir, 'sam-summary.json'), `${JSON.stringify({ latency, summaries }, null, 2)}\n`);
console.log(`Overlays and summary in data/spike/${manifest.id}/`);
