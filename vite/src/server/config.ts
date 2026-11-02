import 'dotenv/config';

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const config = {
  modelApiKey: optional('MODEL_API_KEY'),
  modelApiBaseUrl: optional('MODEL_API_BASE_URL') ?? 'https://api.meta.ai/v1',
  telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
  livePasscode: optional('LIVE_PASSCODE'),
  frameBudget: Number(optional('FRAME_BUDGET') ?? 60_000),
  /** Seconds before an unacknowledged critical alert escalates. */
  escalateAfterS: Number(optional('ESCALATE_AFTER_S') ?? 45),
  /** Hard cap on Muse Spark alert-drafting calls per server process. */
  agentCallBudget: Number(optional('AGENT_CALL_BUDGET') ?? 300),
  port: Number(optional('PORT') ?? 8787),
};

export function requireModelApiKey(): string {
  if (!config.modelApiKey) {
    throw new Error('MODEL_API_KEY is not set. Run "npm run setup" to add your Meta Model API key.');
  }
  return config.modelApiKey;
}
