import { NextResponse } from 'next/server';
import { getTelegramChannel } from '@/lib/telegram-server';
import { config, liveAvailable, liveSupported, uploadsAvailable } from '@/components/demo/server/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  // live means Live can actually run on THIS server, not just that a
  // Meta key exists: a key under MODEL_API_KEY (preferred) or META_KEY
  // plus a writable, long-running server. On Vercel live is false even
  // when a key is set, so the demo offers Replay only there.
  // liveKeyConfigured keeps the key-presence fact visible for debugging.
  // Telegram is true when the main bot token is set in .env, since demo
  // patrol alerts now go through that same bot channel.
  return NextResponse.json({
    ok: true,
    live: liveSupported(),
    liveKeyConfigured: liveAvailable(),
    environment: process.env.VERCEL ? 'vercel' : 'local',
    uploads: uploadsAvailable(),
    livePasscodeRequired: Boolean(config.livePasscode),
    telegram: getTelegramChannel() !== null,
  });
}
