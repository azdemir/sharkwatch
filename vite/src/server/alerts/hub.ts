// Server-wide view of alerts across sessions: authority consoles subscribe here, and Telegram
// acknowledgements find their alert here.

import type { AlertJson, RecipientRole } from '../../shared/alerts.ts';
import { config } from '../config.ts';
import { TelegramChannel } from './channels/telegram.ts';
import type { AlertChannel, AlertService } from './service.ts';

type Listener = (alert: AlertJson) => void;

const MAX_KEPT = 200;

export class AlertHub {
  private readonly services = new Map<string, AlertService>();
  private readonly latest = new Map<string, AlertJson>();
  private readonly listeners = new Set<Listener>();

  register(sessionId: string, service: AlertService): void {
    this.services.set(sessionId, service);
  }

  publish(alert: AlertJson): void {
    this.latest.delete(alert.id);
    this.latest.set(alert.id, alert);
    while (this.latest.size > MAX_KEPT) this.latest.delete(this.latest.keys().next().value!);
    for (const listener of this.listeners) listener(alert);
  }

  list(): AlertJson[] {
    return [...this.latest.values()];
  }

  subscribe(listener: Listener, { replay = true } = {}): () => void {
    if (replay) for (const alert of this.latest.values()) listener(alert);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  serviceFor(alertId: string): AlertService | undefined {
    const sessionId = this.latest.get(alertId)?.sessionId;
    return sessionId ? this.services.get(sessionId) : undefined;
  }

  acknowledge(alertId: string, role: RecipientRole, by: string): AlertJson | undefined {
    return this.serviceFor(alertId)?.acknowledge(alertId, role, by);
  }

  resolve(alertId: string, by: string): Promise<AlertJson | undefined> {
    return this.serviceFor(alertId)?.resolve(alertId, by) ?? Promise.resolve(undefined);
  }
}

export const alertHub = new AlertHub();

let telegram: TelegramChannel | undefined;

/** Starts Telegram delivery (long polling) if a bot token is configured. Called by the server entry point. */
export function startTelegram(): TelegramChannel | undefined {
  if (telegram || !config.telegramBotToken) return telegram;
  telegram = new TelegramChannel(config.telegramBotToken);
  // Telegram users subscribed with /start act as the (simulated) lifeguard dispatch.
  telegram.onAcknowledge(({ alertId, by }) => alertHub.acknowledge(alertId, 'lifeguards', `${by} via Telegram`));
  telegram.start();
  return telegram;
}

export function telegramChannel(): TelegramChannel | undefined {
  return telegram;
}

/** Adapts the Telegram channel to what the alert service needs, if Telegram is running. */
export function telegramAlertChannel(): AlertChannel | undefined {
  const tg = telegram;
  return tg ? { broadcast: async (alert) => (await tg.broadcast(alert)).size } : undefined;
}
