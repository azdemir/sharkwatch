// Checks that this machine can run SharkWatch, and says how to fix anything that's missing.
// Usage: npm run doctor [-- --build]   (--build also prepares the analysis chunks for every clip)

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { config } from '../src/server/config.ts';
import { clipDir, ensureChunks } from '../src/server/media/chunks.ts';
import { ffmpeg, FFPROBE } from '../src/server/media/ffmpeg.ts';
import type { ClipManifest } from '../src/shared/manifest.ts';

const { values: args } = parseArgs({ options: { build: { type: 'boolean', default: false } } });

type Status = 'ok' | 'warn' | 'fail';
const results: { status: Status; label: string; detail: string }[] = [];
const report = (status: Status, label: string, detail: string) => results.push({ status, label, detail });

// Node: vitest needs ^22.12 || ^24 || >=26, the OpenAI SDK >=22, @meta-sam/parser >=22.9.
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
const supported = (major === 22 && minor >= 12) || major === 24 || major >= 26;
if (supported) report('ok', 'Node.js', `v${process.versions.node}`);
else if (major === 23 || major === 25) report('warn', 'Node.js', `v${process.versions.node} works for the app but not the tests — prefer an LTS release (22 or 24)`);
else report('fail', 'Node.js', `v${process.versions.node} is too old — install Node 22.12+ or 24 LTS (https://nodejs.org)`);

// Bundled media tools.
try {
  const { stdout } = await ffmpeg(['-version']);
  report('ok', 'ffmpeg (bundled)', stdout.toString().split('\n')[0] ?? '');
} catch (error) {
  report('fail', 'ffmpeg (bundled)', `${(error as Error).message.slice(0, 120)} — run "npm install" again`);
}
report(existsSync(FFPROBE) ? 'ok' : 'fail', 'ffprobe (bundled)', existsSync(FFPROBE) ? FFPROBE : 'missing — run "npm install" again');

// Environment. Every key is optional: without any, the app runs recorded sessions in Replay mode.
// A key that is set but broken is a failure, because the user clearly meant to use it.
if (!existsSync('.env')) report('warn', '.env', 'not created — fine for Replay mode; run "npm run setup" to add your Meta key');
else report('ok', '.env', 'present');

if (!config.modelApiKey) {
  report('warn', 'Meta Model API key', 'not set — Replay mode only; run "npm run setup" to add yours for Live mode (https://dev.meta.ai, API keys tab)');
} else {
  if (!config.modelApiKey.startsWith('LLM_')) report('warn', 'Meta Model API key', 'does not start with "LLM_" — check you copied the whole key');
  try {
    const { metaClient } = await import('../src/server/meta/client.ts');
    const ids = new Set<string>();
    for await (const model of metaClient().models.list()) ids.add(model.id);
    const missing = ['sam-3.1', 'muse-spark-1.3'].filter((m) => !ids.has(m));
    if (missing.length) report('fail', 'Meta Model API key', `valid, but this account can't use: ${missing.join(', ')}`);
    else report('ok', 'Meta Model API key', `valid; sam-3.1 and muse-spark-1.3 available`);
  } catch (error) {
    const status = (error as { status?: number }).status;
    report('fail', 'Meta Model API key', status === 401 ? 'rejected (401) — the key is wrong or was deleted' : (error as Error).message.slice(0, 160));
  }
}

if (!config.telegramBotToken) {
  report('warn', 'Telegram bot', 'TELEGRAM_BOT_TOKEN is empty — alerts will only appear in the in-app console (create a bot with @BotFather)');
} else {
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/getMe`);
    const body = (await res.json()) as { ok: boolean; result?: { username?: string } };
    report(body.ok ? 'ok' : 'fail', 'Telegram bot', body.ok ? `@${body.result?.username}` : 'token rejected — copy it again from @BotFather');
  } catch (error) {
    report('fail', 'Telegram bot', `could not reach Telegram: ${(error as Error).message}`);
  }
}

if (config.modelApiKey && !config.livePasscode) {
  report('warn', 'Live passcode', 'LIVE_PASSCODE is empty — fine locally, but set it before deploying so strangers can\'t spend your credits');
} else if (config.livePasscode) {
  report('ok', 'Live passcode', 'set');
}

// Clips: playback copies are committed; analysis chunks are rebuilt locally.
const clipsRoot = join(process.cwd(), 'data', 'clips');
const clipIds = existsSync(clipsRoot) ? readdirSync(clipsRoot).filter((d) => existsSync(join(clipsRoot, d, 'manifest.json'))) : [];
if (clipIds.length === 0) report('fail', 'Clips', 'no clips found in data/clips — the checkout is incomplete');
for (const id of clipIds) {
  const manifest = JSON.parse(readFileSync(join(clipsRoot, id, 'manifest.json'), 'utf8')) as ClipManifest;
  if (!existsSync(join(clipDir(id), 'playback.mp4'))) {
    report('fail', `Clip ${id}`, 'playback.mp4 missing — the checkout is incomplete');
    continue;
  }
  const built = manifest.chunks.every((c) => existsSync(join(clipDir(id), c.path)));
  if (args.build) {
    try {
      await ensureChunks(manifest);
      report('ok', `Clip ${id}`, `${manifest.chunks.length} chunks ready`);
    } catch (error) {
      report('fail', `Clip ${id}`, (error as Error).message.slice(0, 160));
    }
  } else {
    report(built ? 'ok' : 'warn', `Clip ${id}`, built ? `${manifest.chunks.length} chunks ready` : 'chunks not built yet — built automatically on first use, or run "npm run doctor -- --build"');
  }
}

const icon: Record<Status, string> = { ok: '✔', warn: '!', fail: '✖' };
for (const r of results) console.log(`${icon[r.status]} ${r.label.padEnd(26)} ${r.detail}`);
const failures = results.filter((r) => r.status === 'fail').length;
const mode = config.modelApiKey ? 'Replay and Live modes' : 'Replay mode (run "npm run setup" to add a Meta key for Live)';
console.log(failures ? `\n${failures} problem(s) to fix before running.` : `\nReady: ${mode}.`);
process.exitCode = failures ? 1 : 0;
