// Second opinion on animal tracks from Muse Spark, with evidence snapshots saved for alerts.
// Candidates confirmed in the same chunk are verified together in one call (see verifyBatch).

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { LengthJson, TrackVerdict, VerificationJson } from '../../shared/events.ts';
import { frameByIndex } from '../media/frames.ts';
import { verifyBatch } from '../meta/spark.ts';
import type { LocalDetection } from './detections.ts';
import { cropAround, pixelateBoxes, saveJpeg, toJpegDataUrl, type FrameSize } from './evidence.ts';

export interface VerifyCandidate {
  trackId: string;
  /** The track's detections inside the chunk. */
  detections: LocalDetection[];
  length?: LengthJson;
  /** Frame at which the track was confirmed (seen in enough frames to count as real). */
  readyFrame: number;
}

export interface VerifyBatchRequest {
  candidates: VerifyCandidate[];
  /** Local chunk file and its first global frame; detections must fall inside it. */
  chunkPath: string;
  chunkStartFrame: number;
  frame: FrameSize;
  /** Directory the evidence snapshots are written to. */
  evidenceDir: string;
  /** People seen in the chunk, pixelated in the saved evidence photos. */
  people?: LocalDetection[];
}

export interface VerifyOutcome {
  verdict: TrackVerdict;
  verification: VerificationJson;
  /** File name inside evidenceDir. */
  evidenceFile: string;
}

export interface BatchOutcome {
  outcomes: Map<string, VerifyOutcome>;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface TrackVerifier {
  verify(request: VerifyBatchRequest): Promise<BatchOutcome>;
}

/** Labels below this confidence go to the operator instead of deciding anything. Calibrated on the
 * Day-0 shoreline clip of sharks and rays (no longer shipped): real sharks scored 0.80–0.96, while a
 * partly visible ray was mislabelled "shark" at 0.62. */
export const VERDICT_CONFIDENCE = 0.75;
/** Candidates per Muse Spark call (one overview + one crop each, well under the 50-image limit). */
export const MAX_BATCH = 8;
/** Frames after confirmation the evidence may come from. Verdicts then rest on what a real-time
 * system would have seen about half a second after the animal became a confirmed track. */
export const EVIDENCE_WINDOW_FRAMES = 5;
/** How far past that a close-up may reach when every early outline is cut off by the frame edge
 * (an animal swimming into view): a half-visible tail is what made verdicts "uncertain". */
export const EVIDENCE_REACH_FRAMES = 20;

export function verdictFor(v: { is_shark: boolean; confidence: number }): TrackVerdict {
  if (v.confidence < VERDICT_CONFIDENCE) return 'uncertain';
  return v.is_shark ? 'shark' : 'not_shark';
}

/**
 * Traces each detection's SAM outline (its box when there is no mask), optionally numbered. Showing
 * the outline rather than a box tells Muse Spark exactly which body is meant in a crowded frame,
 * and lets it see when SAM traced two overlapping animals as one.
 */
function outlinesSvg(frame: FrameSize, items: { detection: LocalDetection; label?: string }[]): Buffer {
  const color = '#ff2d2d';
  const shapes = items
    .map(({ detection: d, label }) => {
      const { left, top, right, bottom } = d.box;
      const shape =
        d.maskPath && d.maskSize
          ? `<path d="${d.maskPath}" transform="translate(${left} ${top}) scale(${(right - left) / d.maskSize[0]} ${(bottom - top) / d.maskSize[1]})" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>`
          : `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="none" stroke="${color}" stroke-width="3"/>`;
      if (!label) return shape;
      const ty = top > 30 ? top - 6 : bottom + 26;
      return `${shape}<text x="${left}" y="${ty}" font-family="sans-serif" font-weight="bold" font-size="26" fill="${color}" stroke="black" stroke-width="1">${label}</text>`;
    })
    .join('');
  return Buffer.from(`<svg width="${frame.width}" height="${frame.height}" xmlns="http://www.w3.org/2000/svg">${shapes}</svg>`);
}

function boxArea(d: LocalDetection): number {
  return (d.box.right - d.box.left) * (d.box.bottom - d.box.top);
}

function touchesEdge(d: LocalDetection, frame: FrameSize, margin = 2): boolean {
  return d.box.left <= margin || d.box.top <= margin || d.box.right >= frame.width - 1 - margin || d.box.bottom >= frame.height - 1 - margin;
}

export class SparkVerifier implements TrackVerifier {
  async verify(request: VerifyBatchRequest): Promise<BatchOutcome> {
    const outcomes = new Map<string, VerifyOutcome>();
    let inputTokens = 0;
    let outputTokens = 0;
    for (let i = 0; i < request.candidates.length; i += MAX_BATCH) {
      const batch = await this.verifyOne(request, request.candidates.slice(i, i + MAX_BATCH));
      for (const [id, o] of batch.outcomes) outcomes.set(id, o);
      inputTokens += batch.usage?.inputTokens ?? 0;
      outputTokens += batch.usage?.outputTokens ?? 0;
    }
    return { outcomes, usage: { inputTokens, outputTokens } };
  }

  private async verifyOne(request: VerifyBatchRequest, candidates: VerifyCandidate[]): Promise<BatchOutcome> {
    const usable = candidates.filter((c) => c.detections.length > 0);
    if (usable.length === 0) return { outcomes: new Map() };

    // Evidence comes from just after each track was confirmed, not from later in the chunk.
    const early = (c: VerifyCandidate) => {
      const within = c.detections.filter((d) => d.frame <= c.readyFrame + EVIDENCE_WINDOW_FRAMES);
      return within.length ? within : c.detections.slice(0, 1);
    };
    // Overview on the early frame where the most candidates are visible; others use their nearest box.
    const counts = new Map<number, number>();
    for (const c of usable) for (const d of early(c)) counts.set(d.frame, (counts.get(d.frame) ?? 0) + 1);
    const overviewFrame = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
    const nearestTo = (c: VerifyCandidate) =>
      c.detections.reduce((best, d) => (Math.abs(d.frame - overviewFrame) < Math.abs(best.frame - overviewFrame) ? d : best));

    const overviewPng = await frameByIndex(request.chunkPath, overviewFrame - request.chunkStartFrame);
    const numbered = await sharp(overviewPng)
      .composite([{ input: outlinesSvg(request.frame, usable.map((c, i) => ({ detection: nearestTo(c), label: String(i + 1) }))) }])
      .png()
      .toBuffer();

    // Close-ups keep the candidate's own outline traced, so only that body is in question. Each uses
    // the candidate's largest early outline clear of the frame edge (the most of the animal in view).
    const inside = (d: LocalDetection) => !touchesEdge(d, request.frame);
    const largest = (ds: LocalDetection[]) => ds.reduce((best, d) => (boxArea(d) > boxArea(best) ? d : best));
    const closeUps = usable.map((c) => {
      const clear = early(c).filter(inside);
      if (clear.length) return largest(clear);
      const later = c.detections.find((d) => d.frame <= c.readyFrame + EVIDENCE_REACH_FRAMES && inside(d));
      return later ?? largest(early(c));
    });
    const crops = await Promise.all(
      usable.map(async (c, i) => {
        const shot = closeUps[i]!;
        const png = shot.frame === overviewFrame ? overviewPng : await frameByIndex(request.chunkPath, shot.frame - request.chunkStartFrame);
        const traced = await sharp(png).composite([{ input: outlinesSvg(request.frame, [{ detection: shot }]) }]).png().toBuffer();
        return toJpegDataUrl(await cropAround(traced, shot.box, request.frame), 384);
      }),
    );

    const run = await verifyBatch(
      await toJpegDataUrl(numbered, 1280),
      usable.map((c, i) => ({ number: i + 1, crop: crops[i]!, measuredLength: c.length })),
    );

    mkdirSync(request.evidenceDir, { recursive: true });
    // People within a few frames of the overview are pixelated before anything is saved.
    const nearby = (request.people ?? []).filter((d) => Math.abs(d.frame - overviewFrame) <= 3);
    const privateOverview = await pixelateBoxes(overviewPng, nearby.map((d) => d.box), request.frame);
    const outcomes = new Map<string, VerifyOutcome>();
    const perCallMs = Math.round(run.latencyMs);
    for (const [i, c] of usable.entries()) {
      const v = run.results.get(i + 1);
      if (!v) continue;
      // Evidence for alerts: the overview frame with only this animal outlined.
      const evidenceFile = `${c.trackId}.jpg`;
      const single = await sharp(privateOverview).composite([{ input: outlinesSvg(request.frame, [{ detection: nearestTo(c) }]) }]).png().toBuffer();
      await saveJpeg(single, join(request.evidenceDir, evidenceFile), 960);
      const basedOnFrame = Math.max(overviewFrame, closeUps[i]!.frame);
      outcomes.set(c.trackId, { verdict: verdictFor(v), verification: { ...v, basedOnFrame, latencyMs: perCallMs }, evidenceFile });
    }
    return {
      outcomes,
      usage: run.usage ? { inputTokens: run.usage.input_tokens, outputTokens: run.usage.output_tokens } : undefined,
    };
  }
}
