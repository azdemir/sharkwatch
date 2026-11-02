import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { DATA_DIR } from '@/components/demo/server/sessions';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const rel = params.path.join('/');
  if (!/^clips\/[\w-]+\/playback\.mp4$/.test(rel)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const file = join(DATA_DIR, rel);
  if (!existsSync(file)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new Response(readFileSync(file), { headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' } });
}
