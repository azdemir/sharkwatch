import { NextResponse } from 'next/server';
import { alertHub } from '@/components/demo/server/alerts/hub';
import { capIdentifier, renderCap } from '@/components/demo/server/alerts/cap';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const alert = alertHub.list().find((a) => a.id === params.id);
  if (!alert) return NextResponse.json({ error: 'Unknown alert' }, { status: 404 });
  const msgType = new URL(req.url).searchParams.get('msgType');
  const xml = msgType === 'Cancel' ? renderCap(alert, { msgType: 'Cancel', references: { id: capIdentifier(alert), sent: alert.createdAt } }) : renderCap(alert);
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
