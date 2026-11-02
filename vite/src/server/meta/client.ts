import { createReadStream } from 'node:fs';
import OpenAI from 'openai';
import { config, requireModelApiKey } from '../config.ts';

let client: OpenAI | undefined;

/** Meta Model API is OpenAI-SDK compatible; only the base URL and key differ. */
export function metaClient(): OpenAI {
  client ??= new OpenAI({ baseURL: config.modelApiBaseUrl, apiKey: requireModelApiKey() });
  return client;
}

/** Uploads a local file for reuse across requests. Meta-hosted files never expire. */
export async function uploadFile(path: string): Promise<string> {
  const file = await metaClient().files.create({ file: createReadStream(path), purpose: 'user_data' });
  return file.id;
}

/**
 * Content parts Meta accepts on the Responses API. `input_video` is a Meta extension that the
 * OpenAI SDK types don't model, so requests built from these parts are cast at the call site.
 */
export type MetaInputPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_image'; file_id: string }
  | { type: 'input_video'; file_id: string }
  | { type: 'input_video'; video_url: string };

export function userMessage(content: MetaInputPart[]) {
  return [{ type: 'message' as const, role: 'user' as const, content }];
}
