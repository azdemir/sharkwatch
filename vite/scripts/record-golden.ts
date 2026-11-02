// Records the curated sessions that ship with the repo for keyless Replay mode.
// Runs the full pipeline (all prompts + Muse Spark verification) and keeps the event log and
// evidence snapshots in data/sessions/golden/<clip>/ (committed). Raw SAM output stays local.
//
// Usage: npm run record:golden -- --clips clip-g-capistrano,clip-b-swimmer [--reuse-sam]
//   --reuse-sam re-runs tracking and Muse Spark verification over the SAM output saved by the last
//   recording (data/sessions/golden-work-<clip>/raw): no SAM cost, identical detections.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { ClipManifest } from '../src/shared/manifest.ts';
import { EventBus, recordTo } from '../src/server/events/bus.ts';
import { clipDir } from '../src/server/media/chunks.ts';
import { LiveSamSource, RecordedSamSource } from '../src/server/pipeline/sam-source.ts';
import { runSession } from '../src/server/pipeline/session.ts';
import { SparkVerifier } from '../src/server/pipeline/verifier.ts';
import { GOLDEN_DIR, SESSIONS_DIR } from '../src/server/sessions.ts';

const { values: args } = parseArgs({ options: { clips: { type: 'string' }, 'reuse-sam': { type: 'boolean', default: false } } });
if (!args.clips) {
  console.error('Usage: npm run record:golden -- --clips <clip-id>[,<clip-id>…]');
  process.exit(1);
}

let total = 0;
for (const clipId of args.clips.split(',').map((c) => c.trim()).filter(Boolean)) {
  const manifest = JSON.parse(readFileSync(join(clipDir(clipId), 'manifest.json'), 'utf8')) as ClipManifest;
  const workDir = join(SESSIONS_DIR, `golden-work-${clipId}`);
  const rawDir = join(workDir, 'raw');
  const reuse = args['reuse-sam'] && existsSync(rawDir);
  if (args['reuse-sam'] && !reuse) console.log(`${clipId}: no saved SAM output, running SAM`);
  if (reuse) {
    // Keep the saved SAM output; start the rest afresh.
    rmSync(join(workDir, 'events.jsonl'), { force: true });
    rmSync(join(workDir, 'evidence'), { recursive: true, force: true });
  } else {
    rmSync(workDir, { recursive: true, force: true });
  }
  const bus = new EventBus(`golden-${clipId}`);
  recordTo(bus, join(workDir, 'events.jsonl'));

  const started = performance.now();
  const result = await runSession({
    manifest,
    bus,
    sam: reuse ? new RecordedSamSource(rawDir) : new LiveSamSource(rawDir),
    verifier: new SparkVerifier(),
    sessionDir: workDir,
    realtime: false,
    prompts: 'thorough',
  });
  if (result.reason !== 'completed') throw new Error(`${clipId}: session ended with ${result.reason}`);

  const out = join(GOLDEN_DIR, clipId);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(join(workDir, 'events.jsonl'), join(out, 'events.jsonl'));
  if (existsSync(join(workDir, 'evidence'))) cpSync(join(workDir, 'evidence'), join(out, 'evidence'), { recursive: true });

  const verdicts = result.tracks.reduce<Record<string, number>>((acc, t) => {
    const key = t.kind === 'person' ? 'person' : (t.verdict ?? 'pending');
    return { ...acc, [key]: (acc[key] ?? 0) + 1 };
  }, {});
  total += result.costUsd;
  console.log(`${clipId}: ${JSON.stringify(verdicts)} · $${result.costUsd.toFixed(3)} · ${((performance.now() - started) / 1000).toFixed(0)} s → data/sessions/golden/${clipId}/`);
}
console.log(`Total $${total.toFixed(3)}`);
