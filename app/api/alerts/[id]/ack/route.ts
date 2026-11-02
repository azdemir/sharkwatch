import { NextResponse } from 'next/server';
import { alertHub } from '@/components/demo/server/alerts/hub';
import { RECIPIENT_NAMES } from '../../../../../components/demo/shared/alerts.ts';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const role = body.role;
  if (!role || !(role in RECIPIENT_NAMES)) return NextResponse.json({ error: 'Unknown recipient role' }, { status: 400 });
  const by = typeof body.by === 'string' && body.by.trim() ? body.by.trim().slice(0, 60) : RECIPIENT_NAMES[role as keyof typeof RECIPIENT_NAMES];
  const alert = alertHub.acknowledge(params.id, role, by);
  if (!alert) return NextResponse.json({ error: 'Unknown alert' }, { status: 404 });
  return NextResponse.json(alert);
}
