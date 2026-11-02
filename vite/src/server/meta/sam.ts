// SAM 3.1 video segmentation over the Meta Model API.

import {
  parseVideoStream,
  recordsOfKind,
  type SegmentationMask,
  type SegmentationMaskRecord,
  type VideoSegmentationResult,
} from '@meta-sam/parser';
import type OpenAI from 'openai';
import { metaClient, userMessage, type MetaInputPart } from './client.ts';
import { metaGate } from './gate.ts';

export const SAM_MODEL = 'sam-3.1';

export interface SamBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SamDetection {
  /** Stable only within one response. */
  objectId: string;
  /** Zero-based index into the submitted clip. */
  frameIndex: number;
  box: SamBox;
  confidence?: number;
  mask?: SegmentationMask;
  /** Half-open source-pixel box the mask raster covers. */
  maskBounds?: SamBox;
}

export interface SamVideoRun {
  concept: string;
  detections: SamDetection[];
  result: VideoSegmentationResult;
  /** From `usage.video_frames_processed` on `response.completed`, when present. */
  framesBilled?: number;
  timing: { firstFrameMs?: number; totalMs: number };
}

export interface SamVideoRequest {
  video: { fileId: string } | { url: string };
  concept: string;
  includeConfidence?: boolean;
  maskEncoding?: 'lossless' | 'one_bit';
  /** Called with each new cumulative snapshot as frames stream in. */
  onProgress?: (detections: SamDetection[]) => void;
}

type StreamEvent = { type: string; response?: { usage?: Record<string, unknown> } };

/** Passes events through unchanged while noting first-frame time and billed frames. */
async function* tap(
  source: AsyncIterable<StreamEvent>,
  seen: { firstDeltaAt?: number; framesBilled?: number },
): AsyncGenerator<StreamEvent> {
  for await (const event of source) {
    if (event.type === 'response.output_text.delta' && seen.firstDeltaAt === undefined) {
      seen.firstDeltaAt = performance.now();
    }
    if (event.type === 'response.completed') {
      const frames = event.response?.usage?.['video_frames_processed'];
      if (typeof frames === 'number') seen.framesBilled = frames;
    }
    yield event;
  }
}

export function detectionsFrom(result: Pick<VideoSegmentationResult, 'records'>): SamDetection[] {
  const masks = new Map<string, SegmentationMaskRecord>();
  for (const mask of recordsOfKind(result.records, 'mask')) {
    masks.set(`${mask.frame?.frameIndex ?? 0}:${mask.objectId}`, mask);
  }
  return recordsOfKind(result.records, 'box').map((box) => {
    const frameIndex = box.frame?.frameIndex ?? 0;
    const mask = masks.get(`${frameIndex}:${box.objectId}`);
    return {
      objectId: box.objectId,
      frameIndex,
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      confidence: box.confidence,
      mask: mask?.mask,
      maskBounds: mask ? { ...mask.bounds } : undefined,
    };
  });
}

/** Re-parses saved SAM output (one line per frame), e.g. test fixtures or recorded sessions. */
export async function parseRawOutput(rawOutput: string): Promise<VideoSegmentationResult> {
  async function* events() {
    const lane = { item_id: 'recorded', output_index: 0, content_index: 0 };
    for (const line of rawOutput.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
      yield { type: 'response.output_text.delta' as const, delta: line, ...lane };
    }
    // The parser requires the lane to be finalized before completion, as the live API does.
    yield { type: 'response.output_text.done' as const, text: rawOutput, ...lane };
    yield { type: 'response.completed' as const };
  }
  return parseVideoStream(events()).finalResult;
}

export async function segmentVideo(request: SamVideoRequest): Promise<SamVideoRun> {
  const media: MetaInputPart =
    'fileId' in request.video
      ? { type: 'input_video', file_id: request.video.fileId }
      : { type: 'input_video', video_url: request.video.url };

  const metadata: Record<string, string> = {
    include_confidence: request.includeConfidence === false ? 'false' : 'true',
    mask_encoding: request.maskEncoding ?? 'one_bit',
  };

  // Held until the stream ends: Meta is busy with this request until then.
  return metaGate.run('sam', async () => {
    const startedAt = performance.now();
    const stream = await metaClient().responses.create({
      model: SAM_MODEL,
      input: userMessage([{ type: 'input_text', text: request.concept }, media]),
      stream: true,
      metadata,
    } as unknown as OpenAI.Responses.ResponseCreateParamsStreaming);

    const seen: { firstDeltaAt?: number; framesBilled?: number } = {};
    const parsed = parseVideoStream(tap(stream as AsyncIterable<StreamEvent>, seen));
    for await (const snapshot of parsed) {
      request.onProgress?.(detectionsFrom(snapshot));
    }
    const result = await parsed.finalResult;

    return {
      concept: request.concept,
      detections: detectionsFrom(result),
      result,
      framesBilled: seen.framesBilled,
      timing: {
        firstFrameMs: seen.firstDeltaAt === undefined ? undefined : seen.firstDeltaAt - startedAt,
        totalMs: performance.now() - startedAt,
      },
    };
  });
}
