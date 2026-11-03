import { NextResponse } from 'next/server';
import { getSharedAck, getSharedResolved } from '@/lib/ack-store';
// Polled by the demo UI for the current alert. This is the Vercel-safe
// read path: it answers from the shared store (Supabase, KV fallback),
// not from this instance's in-memory hub, so it works even when the
// instance that raised the alert is long gone. Returns
// { acknowledged: false, resolved: false } when there is no shared
// record (including when no shared store is configured). Resolved is
// included here so the UI poll can show All clear from another instance
// or another device, the same way it already shows a Telegram ack.
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const [ack, resolved] = await Promise.all([getSharedAck(params.id), getSharedResolved(params.id)]);
  return NextResponse.json({
    acknowledged: Boolean(ack),
    alertId: params.id,
    by: ack?.by,
    at: ack?.at,
    resolved: Boolean(resolved),
    resolvedBy: resolved?.by,
    resolvedAt: resolved?.at,
  });
}
