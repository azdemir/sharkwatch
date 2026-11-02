// One-time setup: asks for your Meta Model API key (and optionally a Telegram bot token), checks
// them, and saves them to .env on this computer only. Git never uploads .env.
// Usage: npm run setup   (run it again any time to replace or remove a key)

import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import OpenAI from 'openai';
import { config } from '../src/server/config.ts';
import { ensureChunks } from '../src/server/media/chunks.ts';
import type { ClipManifest } from '../src/shared/manifest.ts';
import { cleanPastedValue, maskSecret, readEnvValue, setEnvValues } from './lib/env-file.ts';

const ENV = '.env';
const REQUIRED_MODELS = ['sam-3.1', 'muse-spark-1.3'];

// Typed or pasted secrets are never echoed: output is muted while an answer is being entered.
let muted = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
// Lines are queued as they arrive, so nothing typed or pasted while a key is being checked is lost.
const lines: string[] = [];
let waiting: ((line: string | undefined) => void) | undefined;
let closed = false;
rl.on('line', (line) => {
  // A chunk of pasted input arrives as several lines at once: each waiter takes exactly one.
  const resolve = waiting;
  waiting = undefined;
  if (resolve) resolve(line);
  else lines.push(line);
});
rl.on('close', () => {
  closed = true;
  const resolve = waiting;
  waiting = undefined;
  resolve?.(undefined);
});

async function ask(question: string, secret: boolean): Promise<string> {
  process.stdout.write(question);
  muted = secret;
  const line = lines.length ? lines.shift() : closed ? undefined : await new Promise<string | undefined>((resolve) => (waiting = resolve));
  muted = false;
  if (secret && process.stdin.isTTY) process.stdout.write('\n');
  return cleanPastedValue(line ?? '');
}

type Check = { ok: true; detail: string } | { ok: false; detail: string; retry: boolean };

async function checkMetaKey(key: string): Promise<Check> {
  try {
    const client = new OpenAI({ baseURL: config.modelApiBaseUrl, apiKey: key });
    const ids = new Set<string>();
    for await (const model of client.models.list()) ids.add(model.id);
    const missing = REQUIRED_MODELS.filter((m) => !ids.has(m));
    if (missing.length) return { ok: false, retry: false, detail: `valid, but this account can't use ${missing.join(' or ')}` };
    return { ok: true, detail: 'valid; SAM 3.1 and Muse Spark are available' };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) return { ok: false, retry: true, detail: 'Meta rejected this key. Check you copied all of it (it starts with LLM_)' };
    return { ok: false, retry: false, detail: `couldn't reach Meta to check it (${(error as Error).message.slice(0, 80)})` };
  }
}

async function checkTelegramToken(token: string): Promise<Check> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const body = (await res.json()) as { ok: boolean; result?: { username?: string } };
    return body.ok ? { ok: true, detail: `bot @${body.result?.username}` } : { ok: false, retry: true, detail: 'Telegram rejected this token. Copy it again from @BotFather' };
  } catch (error) {
    return { ok: false, retry: false, detail: `couldn't reach Telegram to check it (${(error as Error).message.slice(0, 80)})` };
  }
}

/**
 * Asks for one secret, checks it, and returns what to store: the new value, the current one
 * (Enter keeps it), '' to remove it, or undefined to leave the setting untouched.
 */
async function askSecret(label: string, current: string | undefined, check: (v: string) => Promise<Check>, prefix?: string): Promise<string | undefined> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = current
      ? `  Saved: ${maskSecret(current)}. Press Enter to keep it, type "remove" to delete it, or paste a new one (hidden): `
      : `  Paste it and press Enter (hidden), or just press Enter to skip: `;
    const answer = await ask(prompt, true);
    if (!answer) return current;
    if (answer.toLowerCase() === 'remove') {
      console.log(`  Removed the ${label}.`);
      return '';
    }
    if (prefix && !answer.startsWith(prefix)) console.log(`  Note: a ${label} usually starts with "${prefix}".`);
    process.stdout.write('  Checking… ');
    const result = await check(answer);
    if (result.ok) {
      console.log(`✔ ${result.detail} (${maskSecret(answer)})`);
      return answer;
    }
    console.log(`✖ ${result.detail}.`);
    if (!result.retry) {
      console.log('  Saving it anyway; run "npm run doctor" later to check it again.');
      return answer;
    }
    if (attempt < 3) console.log('  Try again.');
  }
  console.log(current ? '  Keeping the saved one.' : `  Skipped: no ${label} saved.`);
  return current;
}

console.log('\nSharkWatch setup');
console.log('Saves your keys to .env in this folder, on this computer only. Git never uploads that file.\n');

const existing = existsSync(ENV) ? readFileSync(ENV, 'utf8') : undefined;
const template = existing ?? (existsSync('.env.example') ? readFileSync('.env.example', 'utf8') : '');

console.log('1. Meta Model API key: turns on Live mode and Muse Spark-written alerts (https://dev.meta.ai → API keys).');
const metaKey = await askSecret('Meta key', readEnvValue(template, 'MODEL_API_KEY'), checkMetaKey, 'LLM_');

console.log('\n2. Telegram bot token, optional: sends alerts to phones (create a bot by messaging @BotFather).');
const telegram = await askSecret('Telegram token', readEnvValue(template, 'TELEGRAM_BOT_TOKEN'), checkTelegramToken);
rl.close();

const updates: Record<string, string> = {};
if (metaKey !== undefined) updates.MODEL_API_KEY = metaKey;
if (telegram !== undefined) updates.TELEGRAM_BOT_TOKEN = telegram;
writeFileSync(ENV, setEnvValues(template, updates), { mode: 0o600 });
try {
  chmodSync(ENV, 0o600); // owner-only, also when the file already existed (no-op on Windows)
} catch {
  // Not supported on this file system; the file still works.
}
console.log(`\nSaved ${ENV}.`);

// Build each clip's analysis chunks now so the first patrol starts right away.
process.stdout.write('Preparing the video clips (one time, a few seconds)… ');
const clipsRoot = join('data', 'clips');
for (const id of readdirSync(clipsRoot).filter((d) => existsSync(join(clipsRoot, d, 'manifest.json')))) {
  await ensureChunks(JSON.parse(readFileSync(join(clipsRoot, id, 'manifest.json'), 'utf8')) as ClipManifest);
}
console.log('done.');

console.log(`\nReady: ${metaKey ? 'Replay and Live modes' : 'Replay mode (run "npm run setup" again to add a Meta key for Live)'}.`);
console.log('Next: run "npm run dev" and open http://localhost:5173\n');
