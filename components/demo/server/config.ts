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

export function requireModelApiKey(): string {
  if (!config.modelApiKey) {
    throw new Error('No Meta API key is set. Add MODEL_API_KEY (or META_KEY) to .env next to package.json, then restart the dev server.');
  }
  return config.modelApiKey;
}
