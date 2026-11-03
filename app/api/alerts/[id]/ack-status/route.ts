import { NextResponse } from 'next/server';
import { getSharedAck } from '@/lib/ack-store';
// Polled by the demo UI for the current alert. This is the Vercel-safe
// read path: it answers from the shared KV store, not from this
// instance's in-memory hub, so it works even when the instance that
// raised the alert is long gone. Returns { acknowledged: false } when
// there is no shared record (including when KV is not configured).
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ack = await getSharedAck(params.id);
  if (!ack) return NextResponse.json({ acknowledged: false, alertId: params.id });
  return NextResponse.json({ acknowledged: true, alertId: params.id, by: ack.by, at: ack.at });
}
