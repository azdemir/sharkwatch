// Runs a full patrol session on one clip, headless, and prints what it found.
//
// Usage: npm run pipeline -- --clip clip-b-swimmer [--fast] [--no-verify] [--prompts thorough|live]
//        npm run pipeline -- --clip clip-b-swimmer --from-raw data/sessions/<id>   (free re-run of saved SAM output)
//
// Every run is recorded to data/sessions/<id>/ (events.jsonl, raw SAM output, evidence snapshots).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { SessionEvent, TrackSummary } from '../src/shared/events.ts';
import type { ClipManifest } from '../src/shared/manifest.ts';
import { EventBus, recordTo } from '../src/server/events/bus.ts';
import { clipDir } from '../src/server/media/chunks.ts';
import { LiveSamSource, RecordedSamSource } from '../src/server/pipeline/sam-source.ts';
import { runSession } from '../src/server/pipeline/session.ts';
import { SparkVerifier, type BatchOutcome, type TrackVerifier, type VerifyBatchRequest, type VerifyOutcome } from '../src/server/pipeline/verifier.ts';

const { values: args } = parseArgs({
  options: {
    clip: { type: 'string' },
    fast: { type: 'boolean', default: false },
    'no-verify': { type: 'boolean', default: false },
    'from-raw': { type: 'string' },
    prompts: { type: 'string', default: 'thorough' },
  },
});
if (!args.clip) {
  console.error('Usage: npm run pipeline -- --clip <clip-id> [--fast] [--no-verify] [--from-raw <session dir>]');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(clipDir(args.clip), 'manifest.json'), 'utf8')) as ClipManifest;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const sessionId = `${manifest.id}-${stamp}`;
const sessionDir = join(process.cwd(), 'data', 'sessions', sessionId);

/** Replays the verdicts a previous session reached, so a --from-raw run costs nothing. */
class RecordedVerifier implements TrackVerifier {
  private readonly outcomes = new Map<string, VerifyOutcome>();
  constructor(eventsPath: string) {
    for (const line of readFileSync(eventsPath, 'utf8').split('\n')) {
      if (!line) continue;
      const event = JSON.parse(line) as SessionEvent;
      if (event.type === 'track.updated' && event.track.verification) {
        const t = event.track;
        this.outcomes.set(t.id, { verdict: t.verdict ?? 'uncertain', verification: t.verification!, evidenceFile: t.evidence?.replace(/^evidence\//, '') ?? '' });
      }
    }
  }
  async verify(request: VerifyBatchRequest): Promise<BatchOutcome> {
    const outcomes = new Map<string, VerifyOutcome>();
    for (const { trackId } of request.candidates) {
      const outcome = this.outcomes.get(trackId);
      if (outcome) outcomes.set(trackId, outcome);
    }
    return { outcomes };
  }
}

const fromRaw = args['from-raw'];
const sam = fromRaw ? new RecordedSamSource(join(fromRaw, 'raw')) : new LiveSamSource(join(sessionDir, 'raw'));
const verifier: TrackVerifier | null = args['no-verify']
  ? null
  : fromRaw
    ? existsSync(join(fromRaw, 'events.jsonl')) ? new RecordedVerifier(join(fromRaw, 'events.jsonl')) : null
    : new SparkVerifier();

const bus = new EventBus(sessionId);
recordTo(bus, join(sessionDir, 'events.jsonl'));

const fmt = (v: number | undefined, digits = 1, unit = '') => (v === undefined ? '–' : `${v.toFixed(digits)}${unit}`);
const printedVerdicts = new Map<string, string>();
bus.subscribe((e) => {
  const at = `[${e.t.toFixed(1).padStart(5)}s]`;
  if (e.type === 'chunk.timing') {
    const sam = Object.entries(e.timing.samMs).map(([c, ms]) => `${c} ${(ms / 1000).toFixed(1)}s`).join(', ');
    console.log(`${at} chunk ${e.timing.chunk}: ${sam} · ${e.timing.framesBilled} frames · lag ${e.timing.lagS.toFixed(1)}s · $${e.costUsd.toFixed(3)}`);
  } else if (e.type === 'track.updated' && e.track.verification && printedVerdicts.get(e.track.id) !== e.track.verdict) {
    printedVerdicts.set(e.track.id, e.track.verdict ?? '');
    const v = e.track.verification;
    console.log(`${at} ${e.track.id} → ${e.track.verdict} (${v.label}${v.species_guess ? `, ${v.species_guess}` : ''}, ${v.confidence.toFixed(2)}) in ${(v.latencyMs / 1000).toFixed(1)}s`);
  } else if (e.type === 'warning') {
    console.log(`${at} ! ${e.message}`);
  }
});

console.log(`Session ${sessionId}: ${manifest.title} (${manifest.chunks.length} chunks, ${args.fast || fromRaw ? 'fast' : 'real-time'}, ${args.prompts} prompts)`);
const result = await runSession({
  manifest,
  bus,
  sam,
  verifier,
  sessionDir,
  realtime: !args.fast && !fromRaw,
  prompts: args.prompts === 'live' ? 'live' : 'thorough',
});

const order = (t: TrackSummary) => (t.kind === 'animal' ? 0 : 1);
const rows = result.tracks
  .filter((t) => t.lifecycle !== 'tentative' || t.framesSeen >= 4)
  .sort((a, b) => order(a) - order(b) || Number(a.id.slice(1)) - Number(b.id.slice(1)))
  .map((t) => ({
    id: t.id,
    kind: t.kind,
    via: t.concepts.join('+'),
    verdict: t.verdict ?? '',
    label: t.verification ? `${t.verification.label}${t.verification.species_guess ? ` (${t.verification.species_guess})` : ''}` : '',
    frames: t.framesSeen,
    length: t.length ? `${t.length.meters.toFixed(1)} m (${t.length.low.toFixed(1)}–${t.length.high.toFixed(1)})` : '',
    speed: fmt(t.speedMps, 2, ' m/s'),
    heading: fmt(t.headingDeg, 0, '°'),
    person: fmt(t.nearestPersonM, 1, ' m'),
    shore: fmt(t.distanceToShoreM, 1, ' m'),
    swim: t.inSwimZone ? 'yes' : '',
    state: t.lifecycle,
  }));
console.table(rows);
console.log(`Ended: ${result.reason} · cost $${result.costUsd.toFixed(3)} · recorded to data/sessions/${sessionId}/`);
