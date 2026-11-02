import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { getSession } from '@/components/demo/server/sessions';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: { id: string; file: string } }) {
  if (!/^[\w-]+\.jpg$/.test(params.file)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const session = getSession(params.id);
  if (!session) return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
  const path = join(session.dir, 'evidence', params.file);
  if (!existsSync(path)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new Response(readFileSync(path), { headers: { 'Content-Type': 'image/jpeg' } });
}
