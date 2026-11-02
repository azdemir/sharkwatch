import { NextResponse } from 'next/server';
import { alertHub } from '@/components/demo/server/alerts/hub';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const by = typeof body.by === 'string' && body.by.trim() ? body.by.trim().slice(0, 60) : 'Operator';
  const alert = await alertHub.resolve(params.id, by);
  if (!alert) return NextResponse.json({ error: 'Unknown alert' }, { status: 404 });
  return NextResponse.json(alert);
}
