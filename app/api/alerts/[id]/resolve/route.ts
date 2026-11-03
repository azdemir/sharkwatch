import { NextResponse } from 'next/server';
import { alertHub } from '@/components/demo/server/alerts/hub';
import { saveSharedResolved } from '@/lib/ack-store';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const by = typeof body.by === 'string' && body.by.trim() ? body.by.trim().slice(0, 60) : 'Operator';
  const alert = await alertHub.resolve(params.id, by);
  if (alert) {
    // Also record it in the shared store, so a later instance (Vercel)
    // and the UI's ack-status poll can see it even if this instance dies.
    await saveSharedResolved(params.id, by);
    return NextResponse.json(alert);
  }
  // In-memory hub missed (the normal Vercel case: this request landed on
  // a different instance than the one that raised the alert). This is the
  // same fallback the ack route already has, which the resolve route was
  // missing — that missing fallback is exactly "Unknown alert" from the
  // All clear button on Vercel. Record the resolve in the shared store
  // instead of failing, so the UI poll can still show All clear. Only
  // fail when there is no shared store either — that is the old Mac-local
  // behaviour, and the error is real.
  const shared = await saveSharedResolved(params.id, by);
  if (shared) return NextResponse.json({ resolved: true, alertId: params.id, by });
  return NextResponse.json({ error: 'Unknown alert' }, { status: 404 });
}
