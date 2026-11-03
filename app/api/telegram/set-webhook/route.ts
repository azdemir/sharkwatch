import { NextResponse } from 'next/server';
// One-time setup: visit this URL on the deployed site after a deploy
// and it points this bot's Telegram updates at /api/telegram/webhook
// on the same origin, using the server-side TELEGRAM_BOT_TOKEN (the
// token itself is never returned or exposed). Prefer a separate bot
// token for Vercel — see the webhook route note — so Mac polling for
// the local bot keeps working.
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set on this server.' }, { status: 503 });
  const host = req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  if (!host) return NextResponse.json({ error: 'No host header.' }, { status: 400 });
  const url = `${proto}://${host}/api/telegram/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, allowed_updates: ['message', 'callback_query'] }),
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json({ webhookUrl: url, telegram: json });
}
