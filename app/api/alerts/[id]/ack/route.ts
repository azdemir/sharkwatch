import { NextResponse } from 'next/server';
import { alertHub } from '@/components/demo/server/alerts/hub';
import { RECIPIENT_NAMES } from '../../../../../components/demo/shared/alerts.ts';
import { saveSharedAck } from '@/lib/ack-store';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const role = body.role;
  if (!role || !(role in RECIPIENT_NAMES)) return NextResponse.json({ error: 'Unknown recipient role' }, { status: 400 });
  const by = typeof body.by === 'string' && body.by.trim() ? body.by.trim().slice(0, 60) : RECIPIENT_NAMES[role as keyof typeof RECIPIENT_NAMES];
  const alert = alertHub.acknowledge(params.id, role, by);
  if (alert) {
    // Also record it in the shared store, so a later instance (Vercel)
    // and the UI's ack-status poll can see it even if this instance dies.
    await saveSharedAck(params.id, by);
    return NextResponse.json(alert);
  }
  // In-memory hub missed (the normal Vercel case: this request landed on
  // a different instance than the one that raised the alert). Record the
  // ack in the shared store instead of failing, so the UI poll can still
  // show "{by} acknowledged". Only fail when there is no shared store
  // either — that is the old Mac-local behaviour, and the error is real.
  const shared = await saveSharedAck(params.id, by);
  if (shared) return NextResponse.json({ acknowledged: true, alertId: params.id, by });
  return NextResponse.json({ error: 'Unknown alert' }, { status: 404 });
}
