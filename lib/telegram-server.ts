// Server-only Telegram wiring for the Next.js copy (moved from sharkwatch-vite).
// Do not import this from client components: it uses node:fs via lib/telegram.ts.
// A single long-polling channel is kept in globalThis so dev-server reloads do not
// start a second poller (two pollers on one bot token return Telegram 409 Conflict).

import { TelegramChannel } from "./telegram";
import type { Report } from "./types";

declare global {
  var __sharkwatchTelegram: TelegramChannel | undefined;
}

export function getTelegramChannel(): TelegramChannel | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;
  if (!globalThis.__sharkwatchTelegram) {
    const channel = new TelegramChannel(token);
    globalThis.__sharkwatchTelegram = channel;
    channel.start();
  }
  return globalThis.__sharkwatchTelegram;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Broadcast a saved report to Telegram subscribers. Returns how many chats got it. Never throws.
 * Gated: real sends need TELEGRAM_REAL_ALERTS=1. Without it this is a
 * no-op (0 sent) so a report submitted by a reviewer can never message
 * real subscribers just because a bot token happens to be configured. */
export async function broadcastReport(report: Report): Promise<number> {
  if (process.env.TELEGRAM_REAL_ALERTS?.trim() !== '1') return 0;
  try {
    const channel = getTelegramChannel();
    if (!channel) return 0;
    const level = report.status === "DISPATCHED" ? "critical" : "warning";
    const icon = level === "critical" ? "🚨" : "⚠️";
    const html = [
      `${icon} <b>${esc(report.species)} at ${esc(report.beach)}</b>`,
      esc(report.notes || report.location),
      `<b>Action:</b> ${esc(report.species === "Not sure" ? "Log the sighting and keep the beach under watch." : "Alert lifeguards immediately and clear the swim zone.")}`,
      `<b>Ref:</b> ${esc(report.ref)}`,
      `📍 <a href="https://www.openstreetmap.org/?mlat=${report.lat.toFixed(5)}&amp;mlon=${report.lng.toFixed(5)}#map=18/${report.lat.toFixed(5)}/${report.lng.toFixed(5)}">${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}</a>`,
      "<i>SharkWatch exercise: simulated alert, not a real emergency.</i>",
    ].join("\n");
    const sent = await channel.broadcast({ alertId: report.ref, html });
    return sent.size;
  } catch (error) {
    console.warn("telegram broadcast failed:", (error as Error).message);
    return 0;
  }
}
