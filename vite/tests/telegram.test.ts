import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TelegramChannel } from '../src/server/alerts/channels/telegram.ts';

/** A fake Bot API: records calls and serves queued getUpdates batches. */
function fakeTelegram() {
  const calls: { method: string; body: Record<string, unknown> | FormData }[] = [];
  const updates: unknown[][] = [];
  let nextMessageId = 100;
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const method = String(url).split('/').pop()!;
    const body = init?.body instanceof FormData ? init.body : JSON.parse(String(init?.body ?? '{}'));
    calls.push({ method, body });
    const result =
      method === 'getUpdates' ? (updates.shift() ?? []) : method === 'getMe' ? { username: 'sharkwatch_test_bot' } : { message_id: nextMessageId++ };
    return new Response(JSON.stringify({ ok: true, result }), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { calls, updates, fetchImpl };
}

describe('TelegramChannel', () => {
  let dir: string;
  let statePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sharkwatch-telegram-'));
    statePath = join(dir, 'telegram.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('subscribes a chat on /start (with deep-link payload) and remembers the update offset', async () => {
    const tg = fakeTelegram();
    tg.updates.push([{ update_id: 41, message: { chat: { id: 7, first_name: 'Dana' }, text: '/start session-123' } }]);
    const channel = new TelegramChannel('TOKEN', statePath, tg.fetchImpl);
    await channel.pollOnce(0);

    expect(channel.subscribers).toMatchObject([{ chatId: 7, name: 'Dana', via: 'session-123' }]);
    expect(tg.calls.find((c) => c.method === 'sendMessage')?.body).toMatchObject({ chat_id: 7, parse_mode: 'HTML' });
    const saved = JSON.parse(readFileSync(statePath, 'utf8'));
    expect(saved.offset).toBe(42);

    // A restart resumes from the saved offset and keeps subscribers.
    const restarted = new TelegramChannel('TOKEN', statePath, tg.fetchImpl);
    await restarted.pollOnce(0);
    expect(tg.calls.filter((c) => c.method === 'getUpdates').at(-1)?.body).toMatchObject({ offset: 42 });
    expect(restarted.subscribers).toHaveLength(1);
  });

  it('sends alerts with an Acknowledge button and reports the acknowledgement', async () => {
    const tg = fakeTelegram();
    writeFileSync(statePath, JSON.stringify({ offset: 0, subscribers: [{ chatId: 7, name: 'Dana', joinedAt: '' }] }));
    const channel = new TelegramChannel('TOKEN', statePath, tg.fetchImpl);
    const acks: unknown[] = [];
    channel.onAcknowledge((a) => acks.push(a));

    const sent = await channel.broadcast({ alertId: 'A-17', html: '<b>Shark</b> near swimmers' });
    expect(sent.get(7)).toBe(100);
    const message = tg.calls.find((c) => c.method === 'sendMessage')!.body as Record<string, any>;
    expect(message.reply_markup.inline_keyboard[0][0].callback_data).toBe('ack:A-17');

    tg.updates.push([{ update_id: 5, callback_query: { id: 'cb1', data: 'ack:A-17', from: { first_name: 'Dana' }, message: { chat: { id: 7 }, message_id: 100 } } }]);
    await channel.pollOnce(0);
    expect(acks).toEqual([{ alertId: 'A-17', chatId: 7, by: 'Dana' }]);
    // The button press is answered (or it spins forever) and the button shows who acknowledged.
    expect(tg.calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
    const edit = tg.calls.find((c) => c.method === 'editMessageReplyMarkup')!.body as Record<string, any>;
    expect(edit.reply_markup.inline_keyboard[0][0].text).toContain('Dana');
  });

  it('sends a photo as multipart when the evidence image exists', async () => {
    const tg = fakeTelegram();
    const photo = join(dir, 'T3.jpg');
    writeFileSync(photo, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const channel = new TelegramChannel('TOKEN', statePath, tg.fetchImpl);
    await channel.send(7, { alertId: 'A-1', html: 'x', photoPath: photo });
    const call = tg.calls.find((c) => c.method === 'sendPhoto')!;
    expect(call.body).toBeInstanceOf(FormData);
    expect((call.body as FormData).get('chat_id')).toBe('7');
  });

  it('unsubscribes on /stop', async () => {
    const tg = fakeTelegram();
    writeFileSync(statePath, JSON.stringify({ offset: 0, subscribers: [{ chatId: 7, name: 'Dana', joinedAt: '' }] }));
    tg.updates.push([{ update_id: 9, message: { chat: { id: 7 }, text: '/stop' } }]);
    const channel = new TelegramChannel('TOKEN', statePath, tg.fetchImpl);
    await channel.pollOnce(0);
    expect(channel.subscribers).toHaveLength(0);
  });
});
