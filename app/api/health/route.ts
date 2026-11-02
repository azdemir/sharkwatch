import { NextResponse } from 'next/server';
import { getTelegramChannel } from '@/lib/telegram-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Integrated demo: Replay only, so live is always false here.
  // Live (SAM/Spark) is not ported into this one server yet.
  // Telegram is true when the main bot token is set in .env, since demo
  // patrol alerts now go through that same bot channel.
  return NextResponse.json({
    ok: true,
    live: false,
    livePasscodeRequired: false,
    telegram: getTelegramChannel() !== null,
  });
}
