import { NextResponse } from 'next/server';
import { getSession } from '@/components/demo/server/sessions';
export const dynamic = 'force-dynamic';
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession(params.id);
  if (!session) return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
  session.abort.abort();
  return NextResponse.json({ stopped: true });
}
