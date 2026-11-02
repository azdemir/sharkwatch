import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { uploadDir } from '@/components/demo/server/uploads';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!/^[\w-]+$/.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const path = join(uploadDir(params.id), 'playback.mp4');
  if (!existsSync(path)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new Response(readFileSync(path), { headers: { 'Content-Type': 'video/mp4' } });
}
