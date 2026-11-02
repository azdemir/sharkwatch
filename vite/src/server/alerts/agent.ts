// Muse Spark as the dispatch officer: drafts one message per required recipient and picks the
// beach action through tool calls. The server stays in charge: the risk engine has already decided
// who must be told, every tool call is validated, and the templates cover anything missing or late.
// (Model API only supports tool_choice "auto", so a reply with no tool calls is a normal outcome.)

import type OpenAI from 'openai';
import type { BeachAction, RecipientRole } from '../../shared/alerts.ts';
import { metaClient } from '../meta/client.ts';
import { metaGate, type RequestGate } from '../meta/gate.ts';
import { SPARK_MODEL } from '../meta/spark.ts';
import { BEACH_ACTION, headlineFor, templateMessage, type IncidentFacts } from './templates.ts';

export interface Draft {
  headline: string;
  messages: Map<RecipientRole, string>;
  beachAction: BeachAction;
  drafter: 'muse-spark' | 'template';
  latencyMs?: number;
  /** What the guardrails did, for the operator. */
  note?: string;
}

export interface DraftRequest {
  facts: IncidentFacts;
  /** Recipients the risk policy requires; the agent can't add or drop any. */
  required: RecipientRole[];
  msgType: 'Alert' | 'Update';
}

type CreateFn = (body: OpenAI.Responses.ResponseCreateParamsNonStreaming, options: { signal: AbortSignal }) => Promise<{ output: unknown[] }>;

export const AGENT_TIMEOUT_MS = 12_000;
/** In Live mode the agent first waits for the Meta request already running (usually one SAM
 * prompt, 3–15 s). Past this, templates go out instead so the alert isn't held back. */
export const AGENT_QUEUE_MS = 15_000;
const ACTION_ORDER: BeachAction[] = ['monitor', 'warn_swimmers', 'clear_water', 'close_beach'];

export function templateDraft(request: DraftRequest, note?: string): Draft {
  return {
    headline: headlineFor(request.facts),
    messages: new Map(request.required.map((role) => [role, templateMessage(role, request.facts)])),
    beachAction: BEACH_ACTION[request.facts.level],
    drafter: 'template',
    note,
  };
}

function tools(required: RecipientRole[]) {
  return [
    {
      type: 'function',
      name: 'dispatch_alert',
      description: 'Send the alert to one recipient. Call once for every required recipient.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          recipient: { type: 'string', enum: required },
          headline: { type: 'string', description: 'Under 90 characters.' },
          message: { type: 'string', description: 'Under 300 characters, tailored to what this recipient must do.' },
        },
        required: ['recipient', 'headline', 'message'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'set_beach_action',
      description: 'Choose the beach-wide action for this incident.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ACTION_ORDER },
          reason: { type: 'string' },
        },
        required: ['action', 'reason'],
        additionalProperties: false,
      },
    },
  ];
}

function instructions(request: DraftRequest): string {
  const f = request.facts;
  const facts = {
    level: f.level,
    message_type: request.msgType === 'Update' ? 'escalation of an earlier alert' : 'new incident',
    sharks_confirmed: f.sharkCount,
    most_dangerous_shark: { species: f.species ?? 'unidentified', length_m: f.lengthM && Number(f.lengthM.toFixed(1)) },
    nearest_person_m: f.nearestPersonM !== undefined ? Number(f.nearestPersonM.toFixed(1)) : 'none in view',
    in_swim_zone: f.inSwimZone,
    distance_to_shore_m: f.distanceToShoreM !== undefined ? Math.round(f.distanceToShoreM) : 'unknown',
    location: { name: f.locationName, lat: Number(f.lat.toFixed(5)), lon: Number(f.lon.toFixed(5)) },
    risk_reasons: f.risk.reasons,
    recommended_action: f.risk.recommendation,
    minimum_action: BEACH_ACTION[f.level],
    required_recipients: request.required,
  };
  // Phrased as an order to call tools: an earlier wording ("say it is an exercise") made the model
  // reply with that sentence as text and stop.
  return (
    'You are the dispatch officer for a beach drone shark patrol. Dispatch this incident now by calling tools; do not reply with text.\n' +
    `Call dispatch_alert exactly once for each of: ${request.required.join(', ')}. Then call set_beach_action once ` +
    `(at least "${BEACH_ACTION[f.level]}").\n` +
    'Each message must start with "EXERCISE:", be under 300 characters, tell that recipient what to do now, and include the ' +
    'distance to the nearest person and the coordinates. Lifeguards act on the beach and in the water; beach management ' +
    'controls closures and signage; coastal security watches offshore. Use ONLY these facts; never invent numbers, species or places.\n\n' +
    `Facts: ${JSON.stringify(facts)}`
  );
}

export async function draftWithAgent(
  request: DraftRequest,
  options: { create?: CreateFn; timeoutMs?: number; queueMs?: number; gate?: RequestGate } = {},
): Promise<Draft> {
  if (request.required.length === 0) return templateDraft(request);
  const create: CreateFn =
    options.create ?? ((body, opts) => metaClient().responses.create(body, opts) as unknown as Promise<{ output: unknown[] }>);
  const timeoutMs = options.timeoutMs ?? AGENT_TIMEOUT_MS;
  const queueMs = options.queueMs ?? AGENT_QUEUE_MS;
  // Two clocks: how long to wait for the request already running, then how long the call may take.
  const queue = new AbortController();
  const queueTimer = setTimeout(() => queue.abort(), queueMs);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queuedAt = performance.now();
  let startedAt = queuedAt;

  let output: unknown[];
  try {
    const response = await (options.gate ?? metaGate).run(
      'alert',
      () => {
        clearTimeout(queueTimer);
        startedAt = performance.now();
        timer = setTimeout(() => controller.abort(), timeoutMs);
        return create(
          {
            model: SPARK_MODEL,
            reasoning: { effort: 'low' },
            input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: instructions(request) }] }],
            tools: tools(request.required),
            parallel_tool_calls: true,
          } as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming,
          { signal: controller.signal },
        );
      },
      queue.signal,
    );
    output = response.output ?? [];
  } catch (error) {
    const note = controller.signal.aborted
      ? `Muse Spark did not answer within ${timeoutMs / 1000} s; templates used`
      : queue.signal.aborted && startedAt === queuedAt
        ? `Muse Spark was still busy with video analysis after ${queueMs / 1000} s; templates used`
        : `Muse Spark failed (${(error as Error).message.slice(0, 80)}); templates used`;
    return templateDraft(request, note);
  } finally {
    clearTimeout(queueTimer);
    clearTimeout(timer);
  }
  const latencyMs = Math.round(performance.now() - startedAt);
  const waitedMs = startedAt - queuedAt;

  const fallback = templateDraft(request);
  const messages = new Map<RecipientRole, string>();
  let headline: string | undefined;
  let action: BeachAction | undefined;
  const rejected: string[] = [];

  for (const item of output as { type?: string; name?: string; arguments?: string }[]) {
    if (item.type !== 'function_call') continue;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(item.arguments ?? '{}') as Record<string, unknown>;
    } catch {
      rejected.push(`unreadable ${item.name} call`);
      continue;
    }
    if (item.name === 'dispatch_alert') {
      const role = args.recipient as RecipientRole;
      const message = typeof args.message === 'string' ? args.message.trim() : '';
      if (!request.required.includes(role)) {
        rejected.push(`recipient "${String(args.recipient)}" is not required`);
      } else if (message.length < 20 || message.length > 600) {
        rejected.push(`message for ${role} was ${message.length} characters`);
      } else if (!messages.has(role)) {
        messages.set(role, message);
        if (!headline && typeof args.headline === 'string' && args.headline.trim()) headline = args.headline.trim().slice(0, 120);
      }
    } else if (item.name === 'set_beach_action') {
      const chosen = args.action as BeachAction;
      if (ACTION_ORDER.includes(chosen)) action = chosen;
    }
  }

  const missing = request.required.filter((role) => !messages.has(role));
  for (const role of missing) messages.set(role, fallback.messages.get(role)!);

  // The agent may strengthen the beach action but never weaken it below the policy minimum.
  const minimum = BEACH_ACTION[request.facts.level];
  let beachAction = action ?? minimum;
  if (ACTION_ORDER.indexOf(beachAction) < ACTION_ORDER.indexOf(minimum)) {
    rejected.push(`beach action "${beachAction}" is below the ${request.facts.level} minimum`);
    beachAction = minimum;
  }

  const wrote = request.required.length - missing.length;
  const notes = [
    ...(waitedMs >= 1000 ? [`queued ${(waitedMs / 1000).toFixed(1)} s behind video analysis`] : []),
    ...(missing.length ? [`template used for ${missing.join(', ')}`] : []),
    ...rejected,
  ];
  return {
    headline: headline ?? fallback.headline,
    messages,
    beachAction,
    drafter: wrote > 0 ? 'muse-spark' : 'template',
    latencyMs,
    note: wrote === 0 ? `Muse Spark answered without dispatching; templates used${notes.length ? ` (${notes.join('; ')})` : ''}` : notes.join('; ') || undefined,
  };
}
