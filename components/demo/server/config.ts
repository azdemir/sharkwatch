// Live (SAM 3.1 + Muse Spark) configuration for the integrated Next.js demo.
// Adapted from vite/src/server/config.ts. Next.js loads .env itself, so there is
// no dotenv import here (the main app does not depend on dotenv).
//
// Key names: MODEL_API_KEY is preferred. META_KEY is accepted as a fallback
// because that is the name already in use on this machine — a key stored only
// as META_KEY must still turn Live on. Never log or print either value.

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const config = {
  modelApiKey: optional('MODEL_API_KEY') ?? optional('META_KEY'),
  modelApiBaseUrl: optional('MODEL_API_BASE_URL') ?? 'https://api.meta.ai/v1',
  telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
  livePasscode: optional('LIVE_PASSCODE'),
  frameBudget: Number(optional('FRAME_BUDGET') ?? 60_000),
  /** Seconds before an unacknowledged critical alert escalates. */
  escalateAfterS: Number(optional('ESCALATE_AFTER_S') ?? 45),
  /** Hard cap on Muse Spark alert-drafting calls per server process. */
  agentCallBudget: Number(optional('AGENT_CALL_BUDGET') ?? 300),
};

/** True when a Meta key is present under either accepted name. */
export function liveAvailable(): boolean {
  return Boolean(config.modelApiKey);
}

/** True only when Live can actually run on THIS server. A key alone is
 * not enough: Live sessions need a writable session directory and a
 * long-running server, which Vercel serverless does not have — the same
 * reasons uploads are local-only. On Vercel this is false even when a
 * Meta key is set, so the demo must offer Replay only there. */
export function liveSupported(): boolean {
  return liveAvailable() && uploadsAvailable();
}

/** Uploads (and therefore Live over uploaded footage) need a writable disk,
 * yt-dlp for YouTube links, and a long-running server for SAM/Spark sessions.
 * Vercel serverless has none of those: /var/task is read-only (uploads hit
 * ENOENT on mkdir), there is no yt-dlp, and functions time out. So uploads
 * are local-dev only — Vercel must fail fast with a plain message, never
 * with a raw ENOENT. Vercel sets VERCEL=1. */
export function uploadsAvailable(): boolean {
  return !process.env.VERCEL;
}

export function requireModelApiKey(): string {
  if (!config.modelApiKey) {
    throw new Error('No Meta API key is set. Add MODEL_API_KEY (or META_KEY) to .env next to package.json, then restart the dev server.');
  }
  return config.modelApiKey;
}
