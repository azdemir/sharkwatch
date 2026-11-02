import { NextResponse } from "next/server";
import { getTelegramChannel } from "@/lib/telegram-server";

export async function GET() {
  const channel = getTelegramChannel();
  if (!channel) {
    return NextResponse.json({ configured: false, enabled: false, subscribers: 0, hint: "Set TELEGRAM_BOT_TOKEN in .env and restart the dev server." });
  }
  let username: string | null = null;
  try { username = await channel.botUsername(); } catch { username = null; }
  return NextResponse.json({
    configured: true,
    // Demo UI (StatusPanel TelegramLine) reads these names, not `configured`/
    // `botUsername` — without them it treated Telegram as off even when configured.
    enabled: true,
    username: username,
    link: username ? `https://t.me/${username}` : undefined,
    botUsername: username,
    subscribers: channel.subscribers.length,
    subscriberNames: channel.subscribers.map((s) => s.name),
    hint: channel.subscribers.length === 0 ? `Send /start to @${username ?? "your bot"} on Telegram, then check here again.` : undefined,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
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
