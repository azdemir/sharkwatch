import { NextResponse } from "next/server";
import { getTelegramChannel } from "@/lib/telegram-server";

export async function GET() {
  const channel = getTelegramChannel();
  if (!channel) {
    return NextResponse.json({ configured: false, enabled: false, subscribers: 0, hint: "Set TELEGRAM_BOT_TOKEN in .env and restart the dev server." });
  }
  let username: string | null = null;
  try { username = await channel.botUsername(); } catch { username = null; }
  // Merged list: file subscribers plus KV webhook joiners, so a user who
  // joined on Vercel actually shows up in the count here.
  const subscribers = await channel.mergedSubscribers();
  return NextResponse.json({
    configured: true,
    // Demo UI (StatusPanel TelegramLine) reads these names, not `configured`/
    // `botUsername` — without them it treated Telegram as off even when configured.
    enabled: true,
    username: username,
    link: username ? `https://t.me/${username}` : undefined,
    botUsername: username,
    // Count only. Subscriber names (and chat IDs) are private and must
    // never be returned to an unauthenticated caller of this route.
    subscribers: subscribers.length,
    hint: subscribers.length === 0 ? `Send /start to @${username ?? "your bot"} on Telegram, then check here again.` : undefined,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // This endpoint is unauthenticated, so it must never send to real
  // subscribers by default — a reviewer hitting it would otherwise
  // message real people. Real test sends need TELEGRAM_REAL_ALERTS=1.
  if (process.env.TELEGRAM_REAL_ALERTS?.trim() !== '1') {
    return NextResponse.json({ error: 'Real Telegram sends are disabled. Set TELEGRAM_REAL_ALERTS=1 and restart the server for a deliberate test send.', sandbox: true, delivered: 0 }, { status: 503 });
  }
  const channel = getTelegramChannel();
  if (!channel) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is not set." }, { status: 503 });
  }
  const alertId = `TEST-${Date.now().toString(36)}`;
  const sent = await channel.broadcast({
    alertId,
    html: "🦈 <b>TEST ALERT (exercise)</b>\nSharkWatch Telegram test from the Next.js copy.\n\n<i>This is a SharkWatch test. Tap Acknowledge.</i>",
  });
  return NextResponse.json({ alertId, delivered: sent.size, test: body.test === true });
}
