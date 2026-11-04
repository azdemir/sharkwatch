// Telegram delivery: alerts arrive as a photo with an "Acknowledge" button. People subscribe by
// sending /start to the bot (or opening its t.me deep link). Uses long polling, so it works on any
// host without a public webhook URL.
//
// Two processes polling the same bot token make Telegram return 409 Conflict; use one bot per
// running copy (one for local development, one for the deployment).
//
// Moved from sharkwatch-vite/src/server/alerts/channels/telegram.ts (verbatim, except this note).

import { getSharedSubscribers, removeSharedSubscriber, saveSharedSubscriber } from './ack-store';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface TelegramSubscriber {
  chatId: number;
  name: string;
  joinedAt: string;
  via?: string;
}

interface TelegramState {
  offset: number;
  subscribers: TelegramSubscriber[];
}

export interface TelegramAlert {
  alertId: string;
  html: string;
  photoPath?: string;
}

export interface Acknowledgement {
  alertId: string;
  chatId: number;
  by: string;
}

type Fetch = typeof fetch;
const ACK_PREFIX = 'ack:';

export class TelegramChannel {
  private state: TelegramState;
  private polling = false;
  private stopRequested = false;
  private readonly ackHandlers = new Set<(ack: Acknowledgement) => void>();
  private readonly subscribeHandlers = new Set<(s: TelegramSubscriber) => void>();

  constructor(
    private readonly token: string,
    private readonly statePath = join(process.cwd(), 'data', '.cache', 'telegram.json'),
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.state = existsSync(statePath)
      ? (JSON.parse(readFileSync(statePath, 'utf8')) as TelegramState)
      : { offset: 0, subscribers: [] };
  }

  get subscribers(): readonly TelegramSubscriber[] {
    return this.state.subscribers;
  }

  // File subscribers merged with KV subscribers (deduplicated by chatId,
  // KV name wins on a clash). This is the list broadcast and the
  // /api/telegram count must use on Vercel: the file alone is a stale
  // deploy snapshot there, and KV alone would drop file subscribers who
  // joined before the webhook existed. Without KV it is just the file.
  async mergedSubscribers(): Promise<TelegramSubscriber[]> {
    const shared = await getSharedSubscribers();
    if (!shared) return [...this.state.subscribers];
    const byId = new Map<number, TelegramSubscriber>();
    for (const s of this.state.subscribers) byId.set(s.chatId, s);
    for (const s of shared) byId.set(s.chatId, s);
    return [...byId.values()];
  }

  onAcknowledge(handler: (ack: Acknowledgement) => void): () => void {
    this.ackHandlers.add(handler);
    return () => this.ackHandlers.delete(handler);
  }

  onSubscribe(handler: (s: TelegramSubscriber) => void): () => void {
    this.subscribeHandlers.add(handler);
    return () => this.subscribeHandlers.delete(handler);
  }

  async botUsername(): Promise<string> {
    const me = await this.call<{ username: string }>('getMe', {});
    return me.username;
  }

  async broadcast(alert: TelegramAlert): Promise<Map<number, number>> {
    const sent = new Map<number, number>();
    for (const s of await this.mergedSubscribers()) {
      try {
        sent.set(s.chatId, await this.send(s.chatId, alert));
      } catch (error) {
        console.warn(`telegram: could not deliver ${alert.alertId} to ${s.name}: ${(error as Error).message}`);
      }
    }
    return sent;
  }

  async send(chatId: number, alert: TelegramAlert): Promise<number> {
    const keyboard = { inline_keyboard: [[{ text: '✅ Acknowledge', callback_data: `${ACK_PREFIX}${alert.alertId}`.slice(0, 64) }]] };
    if (alert.photoPath && existsSync(alert.photoPath)) {
      const form = new FormData();
      form.set('chat_id', String(chatId));
      form.set('caption', alert.html);
      form.set('parse_mode', 'HTML');
      form.set('reply_markup', JSON.stringify(keyboard));
      form.set('photo', new Blob([await readFile(alert.photoPath)], { type: 'image/jpeg' }), basename(alert.photoPath));
      const message = await this.call<{ message_id: number }>('sendPhoto', form);
      return message.message_id;
    }
    const message = await this.call<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text: alert.html,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    return message.message_id;
  }

  start(): void {
    if (this.polling) return;
    this.polling = true;
    this.stopRequested = false;
    void this.loop();
  }

  stop(): void {
    this.stopRequested = true;
  }

  async pollOnce(timeoutS = 25): Promise<void> {
    type Update = {
      update_id: number;
      message?: { chat: { id: number; first_name?: string; title?: string; username?: string }; text?: string };
      callback_query?: { id: string; data?: string; from: { first_name?: string; last_name?: string; username?: string }; message?: { chat: { id: number }; message_id: number } };
    };
    const updates = await this.call<Update[]>('getUpdates', {
      offset: this.state.offset,
      timeout: timeoutS,
      allowed_updates: ['message', 'callback_query'],
    });
    for (const u of updates) {
      this.state.offset = u.update_id + 1;
      if (u.message?.text?.startsWith('/start')) await this.subscribe(u.message);
      if (u.message?.text?.startsWith('/stop')) await this.unsubscribe(u.message.chat.id);
      if (u.callback_query?.data?.startsWith(ACK_PREFIX)) await this.acknowledge(u.callback_query);
    }
    if (updates.length) this.save();
  }

  private async loop(): Promise<void> {
    let backoffMs = 1000;
    while (!this.stopRequested) {
      try {
        const started = Date.now();
        await this.pollOnce();
        backoffMs = 1000;
        // Belt and braces for the cache-freeze above: a long poll should
        // take seconds. If one ever returns instantly, do not spin —
        // wait out the remainder of a second before polling again.
        const elapsed = Date.now() - started;
        if (elapsed < 1000) await new Promise((r) => setTimeout(r, 1000 - elapsed));
      } catch (error) {
        const message = (error as Error).message;
        if (message.includes('409')) console.warn('telegram: another process is polling this bot (409); use a separate bot per running copy');
        else console.warn(`telegram: ${message}`);
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 30_000);
      }
    }
    this.polling = false;
  }

  private async subscribe(message: { chat: { id: number; first_name?: string; title?: string; username?: string }; text?: string }): Promise<void> {
    const chatId = message.chat.id;
    const name = message.chat.title ?? message.chat.first_name ?? message.chat.username ?? String(chatId);
    const via = message.text?.split(' ')[1];
    let subscriber = this.state.subscribers.find((s) => s.chatId === chatId);
    if (!subscriber) {
      subscriber = { chatId, name, joinedAt: new Date().toISOString(), via };
      this.state.subscribers.push(subscriber);
      // Best effort: also record in KV when configured, so this joiner
      // shows up on Vercel without a push. No-op without KV.
      await saveSharedSubscriber(subscriber);
    }
    await this.call('sendMessage', {
      chat_id: chatId,
      text:
        '🦈 <b>SharkWatch alerts are on.</b>\nYou will get shark alerts from this demo as a simulated lifeguard dispatcher. ' +
        'Tap <b>Acknowledge</b> on an alert to confirm you are responding. Send /stop to unsubscribe.',
      parse_mode: 'HTML',
    });
    this.subscribeHandlers.forEach((h) => h(subscriber));
  }

  private async unsubscribe(chatId: number): Promise<void> {
    this.state.subscribers = this.state.subscribers.filter((s) => s.chatId !== chatId);
    await removeSharedSubscriber(chatId);
    await this.call('sendMessage', { chat_id: chatId, text: 'SharkWatch alerts are off. Send /start to turn them back on.' });
  }

  private async acknowledge(query: { id: string; data?: string; from: { first_name?: string; last_name?: string; username?: string }; message?: { chat: { id: number }; message_id: number } }): Promise<void> {
    const alertId = query.data!.slice(ACK_PREFIX.length);
    // Use the full Telegram name, not just the first name, so the demo UI
    // shows exactly which person acknowledged, not just "Adam".
    const by = [query.from.first_name, query.from.last_name].filter(Boolean).join(' ') || query.from.username || 'someone';
    await this.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Acknowledged. Thank you.' });
    if (query.message) {
      await this.call('editMessageReplyMarkup', {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: `✅ Acknowledged by ${by}`, callback_data: 'noop' }]] },
      }).catch(() => {});
    }
    this.ackHandlers.forEach((h) => h({ alertId, chatId: query.message?.chat.id ?? 0, by }));
  }

  private save(): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  private async call<T = unknown>(method: string, body: object | FormData): Promise<T> {
    const isForm = body instanceof FormData;
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
      // Critical: Next.js caches server fetch responses by default. A
      // cached empty getUpdates reply makes pollOnce() return instantly
      // forever, so loop() spins with no wait and pins the dev server
      // at 100% CPU. Never cache Telegram calls; getUpdates is a
      // 25-second long poll and must actually wait on Telegram.
      cache: 'no-store',
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
    if (!json.ok) throw new Error(`${method} failed (${json.error_code ?? res.status}): ${json.description ?? 'unknown error'}`);
    return json.result as T;
  }
}
