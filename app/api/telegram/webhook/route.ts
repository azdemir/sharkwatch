import { NextResponse } from 'next/server';
import { alertHub } from '@/components/demo/server/alerts/hub';
import { saveSharedAck } from '@/lib/ack-store';
// Telegram webhook for serverless deployments. Polling (lib/telegram.ts)
// only works while a long-running server process is alive, which Vercel
// does not guarantee after a patrol ends. With a webhook set, Telegram
// POSTs each tap here instead, and this route records it in the shared
// KV store that the demo UI polls — so a tap after the patrol ends
// still shows up as "{user} acknowledged" on Vercel.
//
// Note: setting a webhook for a bot takes over its updates globally.
// If the same bot token is also used by Mac polling, Mac polling will
// stop receiving taps while the webhook is set. Use a separate bot
// token for Vercel (see set-webhook) if Mac local Telegram ack must
// keep working at the same time.
export const dynamic = 'force-dynamic';

async function telegramCall(token: string, method: string, body: object) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Answering/editing must never block recording the ack itself.
  }
}

export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const update = (await req.json().catch(() => ({}))) as {
    callback_query?: { id: string; data?: string; from?: { first_name?: string; last_name?: string; username?: string }; message?: { chat: { id: number }; message_id: number } };
  };
  const query = update.callback_query;
  if (!query?.data?.startsWith('ack:')) return NextResponse.json({ ok: true });
  const alertId = query.data.slice('ack:'.length);
  const by = [query.from?.first_name, query.from?.last_name].filter(Boolean).join(' ') || query.from?.username || 'someone';
  if (token) {
    await telegramCall(token, 'answerCallbackQuery', { callback_query_id: query.id, text: 'Acknowledged. Thank you.' });
    if (query.message) {
      await telegramCall(token, 'editMessageReplyMarkup', {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: `✅ Acknowledged by ${by}`, callback_data: 'noop' }]] },
      });
    }
  }
  // Best effort in-memory ack (works if this instance happens to hold
  // the session), then the shared record that the UI actually polls.
  try { alertHub.acknowledge(alertId, 'lifeguards', by); } catch { /* ignore */ }
  await saveSharedAck(alertId, by);
  return NextResponse.json({ ok: true, alertId, by });
}
