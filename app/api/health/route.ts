import { NextResponse } from 'next/server';
import { getTelegramChannel } from '@/lib/telegram-server';
import { config, liveAvailable } from '@/components/demo/server/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Live is true only when a Meta key is actually configured under
  // MODEL_API_KEY (preferred) or META_KEY — never claimed without one.
  // Telegram is true when the main bot token is set in .env, since demo
  // patrol alerts now go through that same bot channel.
  return NextResponse.json({
    ok: true,
    live: liveAvailable(),
    livePasscodeRequired: Boolean(config.livePasscode),
    telegram: getTelegramChannel() !== null,
  });
}
