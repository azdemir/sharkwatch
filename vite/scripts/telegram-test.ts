// End-to-end Telegram check: subscribe from your phone, receive a test alert, tap Acknowledge.
// Usage: npm run telegram:test   (needs TELEGRAM_BOT_TOKEN in .env)

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TelegramChannel } from '../src/server/alerts/channels/telegram.ts';
import { config } from '../src/server/config.ts';

if (!config.telegramBotToken) {
  console.error('TELEGRAM_BOT_TOKEN is empty. Create a bot with @BotFather (/newbot) and add the token to .env.');
  process.exit(1);
}

const channel = new TelegramChannel(config.telegramBotToken);
const username = await channel.botUsername();
console.log(`Bot @${username} is reachable.`);

if (channel.subscribers.length === 0) {
  console.log(`\nOpen https://t.me/${username} on your phone and send /start (waiting up to 2 minutes)…`);
  const subscribed = new Promise<void>((resolve) => channel.onSubscribe(() => resolve()));
  channel.start();
  await Promise.race([subscribed, new Promise((_, reject) => setTimeout(() => reject(new Error('no /start received within 2 minutes')), 120_000))]);
} else {
  channel.start();
}
console.log(`Subscribers: ${channel.subscribers.map((s) => s.name).join(', ')}`);

// Use a real evidence snapshot if a session has produced one.
const sessions = join(process.cwd(), 'data', 'sessions');
const photo = existsSync(sessions)
  ? readdirSync(sessions)
      .map((d) => join(sessions, d, 'evidence'))
      .filter(existsSync)
      .flatMap((d) => readdirSync(d).map((f) => join(d, f)))[0]
  : undefined;

const alertId = `TEST-${Date.now().toString(36)}`;
const acknowledged = new Promise<string>((resolve) => channel.onAcknowledge((a) => a.alertId === alertId && resolve(a.by)));
const sentAt = Date.now();
await channel.broadcast({
  alertId,
  photoPath: photo,
  html:
    '🦈 <b>TEST ALERT (exercise)</b>\n' +
    'Nurse shark, about 1.8 m, 2 m from swimmers.\n' +
    'Miami Beach, FL (simulated)\n\n' +
    '<i>This is a SharkWatch test. Tap Acknowledge.</i>',
});
console.log(`Test alert ${alertId} sent${photo ? ' with an evidence photo' : ''}. Tap "Acknowledge" on your phone (waiting up to 2 minutes)…`);

const by = await Promise.race([acknowledged, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no acknowledgement within 2 minutes')), 120_000))]);
console.log(`✔ Acknowledged by ${by} after ${((Date.now() - sentAt) / 1000).toFixed(1)} s. Telegram delivery works end to end.`);
channel.stop();
process.exit(0);
