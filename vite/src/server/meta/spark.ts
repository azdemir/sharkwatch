// Muse Spark calls: second-opinion verification of a candidate detection.

import type OpenAI from 'openai';
import { metaClient, userMessage, type MetaInputPart } from './client.ts';
import { metaGate } from './gate.ts';

export const SPARK_MODEL = 'muse-spark-1.3';

export const VERIFICATION_LABELS = [
  'shark',
  'dolphin',
  'seal_or_sea_lion',
  'ray',
  'sea_turtle',
  'whale',
  'fish_school',
  'kelp_or_debris',
  'person_or_surfer',
  'boat_or_object',
  'unknown',
] as const;

export type VerificationLabel = (typeof VERIFICATION_LABELS)[number];

export interface Verification {
  is_shark: boolean;
  label: VerificationLabel;
  confidence: number;
  species_guess: string;
  species_confidence: 'low' | 'medium' | 'high';
  behavior: string;
  evidence: string[];
  /** Distinct bodies inside the traced outline: SAM can trace overlapping animals as one. */
  bodies_in_outline: number;
}

const VERIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    is_shark: { type: 'boolean' },
    label: { type: 'string', enum: [...VERIFICATION_LABELS] },
    confidence: { type: 'number', description: 'Probability from 0 to 1 that the label is correct.' },
    species_guess: {
      type: 'string',
      description: 'Most likely species if a shark (e.g. "white shark", "blacktip shark"), otherwise empty.',
    },
    species_confidence: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description:
        'How sure the species call is. Species are hard to tell from above. "high" only when species-diagnostic features are clearly visible (e.g. a nurse shark\'s barbels and two near-equal dorsal fins, a hammerhead\'s head); "medium" when the body shape fits but key features are unclear; "low" when going on size, colour or setting alone.',
    },
    behavior: { type: 'string', description: 'One short sentence on what the animal is doing.' },
    evidence: { type: 'array', items: { type: 'string' }, description: 'Up to four visual cues behind the label.' },
    bodies_in_outline: {
      type: 'integer',
      description:
        'How many distinct animal bodies lie INSIDE the red traced outline (not the surrounding box). 1 when the outline traces a single animal; 2 or more only when the outline itself wraps overlapping animals. Ignore animals outside the outline.',
    },
  },
  required: ['is_shark', 'label', 'confidence', 'species_guess', 'species_confidence', 'behavior', 'evidence', 'bodies_in_outline'],
  additionalProperties: false,
} as const;

const VERIFIER_INSTRUCTIONS = `You verify detections from a drone patrolling a beach for sharks.
The images are crops around one tracked object (a red box marks it on the full frame), taken seconds apart.
Decide what the object is. Distinguish sharks from dolphins (curved dorsal fin, surfacing to breathe,
up-and-down tail beat), seals and sea lions, rays (flat diamond outline), turtles, kelp, debris, surfers and boats.
Sharks swim with a side-to-side tail beat and have a straight-edged triangular dorsal fin and a pointed snout.
Use the measured length as a plausibility check: very large animals may be harmless basking sharks or whales.
If the evidence is weak, say so with a low confidence rather than guessing.`;

const BATCH_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          candidate: { type: 'integer', description: 'The number drawn next to the box.' },
          ...VERIFICATION_SCHEMA.properties,
        },
        required: ['candidate', ...VERIFICATION_SCHEMA.required],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
} as const;

export interface BatchCandidate {
  /** Number drawn next to its box on the overview frame. */
  number: number;
  /** Close-up crop data URL. */
  crop: string;
  measuredLength?: { meters: number; low: number; high: number };
}

export interface BatchVerificationRun {
  results: Map<number, Verification>;
  latencyMs: number;
  usage?: OpenAI.Responses.ResponseUsage;
}

/** One Muse Spark request, queued behind any running Meta request; latency counts from sending. */
function sparkRequest(body: OpenAI.Responses.ResponseCreateParamsNonStreaming) {
  return metaGate.run('verify', async () => {
    const startedAt = performance.now();
    const response = await metaClient().responses.create(body);
    return { response, latencyMs: performance.now() - startedAt };
  });
}

/**
 * Verifies several candidates in one call: an overview frame with numbered boxes, then one crop per
 * candidate. The API serializes requests per key, so one call for N animals is much faster than N
 * calls, and seeing the whole scene keeps labels consistent.
 */
export async function verifyBatch(
  overview: string,
  candidates: BatchCandidate[],
  reasoningEffort: 'low' | 'medium' | 'high' = 'low',
): Promise<BatchVerificationRun> {
  const parts: MetaInputPart[] = [
    {
      type: 'input_text',
      text:
        `${VERIFIER_INSTRUCTIONS.replace('The images are crops around one tracked object (a red box marks it on the full frame), taken seconds apart.', 'The first image is the full frame with each candidate traced by a numbered red outline; then one close-up per candidate, in order, with its outline traced in red.')}\n\n` +
        `Return one entry per candidate number: ${candidates.map((c) => c.number).join(', ')}.`,
    },
    { type: 'input_image', image_url: overview },
  ];
  for (const c of candidates) {
    const length = c.measuredLength
      ? `measured length about ${c.measuredLength.meters.toFixed(1)} m (range ${c.measuredLength.low.toFixed(1)}–${c.measuredLength.high.toFixed(1)} m)`
      : 'no length measurement';
    parts.push({ type: 'input_text', text: `Candidate ${c.number}: ${length}.` });
    parts.push({ type: 'input_image', image_url: c.crop });
  }

  const { response, latencyMs } = await sparkRequest({
    model: SPARK_MODEL,
    reasoning: { effort: reasoningEffort },
    input: userMessage(parts),
    text: { format: { type: 'json_schema', name: 'BatchVerification', schema: BATCH_SCHEMA, strict: true } },
  } as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming);

  const parsed = JSON.parse(response.output_text) as { candidates: (Verification & { candidate: number })[] };
  const results = new Map<number, Verification>();
  for (const { candidate, ...v } of parsed.candidates) results.set(candidate, v);
  return { results, latencyMs, usage: response.usage };
}

export interface VerificationRequest {
  /** JPEG/PNG data URLs: crops first, then the annotated full frame. */
  images: string[];
  /** Optional uploaded chunk so the model can judge motion as well as appearance. */
  videoFileId?: string;
  measuredLength?: { meters: number; low: number; high: number };
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface VerificationRun {
  verification: Verification;
  latencyMs: number;
  usage?: OpenAI.Responses.ResponseUsage;
}

export interface GroundedObject {
  object_name: string;
  /** Normalized 0–1000 grid relative to the image sent. */
  bbox: { x_min: number; y_min: number; x_max: number; y_max: number };
}

const GROUNDING_SCHEMA = {
  type: 'object',
  properties: {
    objects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          object_name: { type: 'string' },
          bbox: {
            type: 'object',
            properties: {
              x_min: { type: 'integer' },
              y_min: { type: 'integer' },
              x_max: { type: 'integer' },
              y_max: { type: 'integer' },
            },
            required: ['x_min', 'y_min', 'x_max', 'y_max'],
            additionalProperties: false,
          },
        },
        required: ['object_name', 'bbox'],
        additionalProperties: false,
      },
    },
  },
  required: ['objects'],
  additionalProperties: false,
} as const;

/** Muse Spark perception grounding: boxes for named objects, used to seed SAM box prompts. */
export async function groundObjects(
  imageDataUrl: string,
  objectNames: string[],
): Promise<{ objects: GroundedObject[]; latencyMs: number }> {
  const names = objectNames.map((n) => `"${n}"`).join(', ');
  const prompt =
    `You are an object grounding expert. Provide the bounding box coordinates of the objects in the image: ${names}. ` +
    'Ensure the objects accurately match the request and do not miss any objects. The coordinates should be in the ' +
    '0-1000 range. If you cannot find an object, omit it from the results.';

  const { response, latencyMs } = await sparkRequest({
    model: SPARK_MODEL,
    reasoning: { effort: 'low' },
    input: userMessage([
      { type: 'input_text', text: prompt },
      { type: 'input_image', image_url: imageDataUrl },
    ]),
    text: { format: { type: 'json_schema', name: 'Grounding', schema: GROUNDING_SCHEMA, strict: true } },
  } as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming);

  const parsed = JSON.parse(response.output_text) as { objects: GroundedObject[] };
  return { objects: parsed.objects, latencyMs };
}

export async function verifyCandidate(request: VerificationRequest): Promise<VerificationRun> {
  const context = request.measuredLength
    ? `Measured length from the mask: about ${request.measuredLength.meters.toFixed(1)} m ` +
      `(plausible range ${request.measuredLength.low.toFixed(1)}–${request.measuredLength.high.toFixed(1)} m).`
    : 'No length measurement available.';

  const parts: MetaInputPart[] = [{ type: 'input_text', text: `${VERIFIER_INSTRUCTIONS}\n\n${context}` }];
  for (const image of request.images) parts.push({ type: 'input_image', image_url: image });
  if (request.videoFileId) parts.push({ type: 'input_video', file_id: request.videoFileId });

  const { response, latencyMs } = await sparkRequest({
    model: SPARK_MODEL,
    reasoning: { effort: request.reasoningEffort ?? 'low' },
    input: userMessage(parts),
    text: { format: { type: 'json_schema', name: 'Verification', schema: VERIFICATION_SCHEMA, strict: true } },
  } as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming);

  return {
    verification: JSON.parse(response.output_text) as Verification,
    latencyMs,
    usage: response.usage,
  };
}
