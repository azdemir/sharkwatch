import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { GOLDEN_DIR, SESSIONS_DIR, getSession } from '@/components/demo/server/sessions';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: { id: string; file: string } }) {
  if (!/^[\w-]+\.jpg$/.test(params.file)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Session ids are only letters, digits and hyphens; anything else cannot be a
  // session and must not be used as a path segment.
  if (!/^[\w-]+$/.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const session = getSession(params.id);
  const candidates: string[] = [];
  if (session) candidates.push(join(session.dir, 'evidence', params.file));
  // After a dev-server restart the in-memory session map is empty, but the
  // evidence is still on disk. Live sessions record to data/sessions/<sessionId>/,
  // Replay sessions replay data/sessions/golden/<clipId>/ — both are derivable
  // from the session id alone ("<clipId>-replay-<ts>" / "<clipId>-live-<ts>").
  candidates.push(join(SESSIONS_DIR, params.id, 'evidence', params.file));
  const clipId = params.id.replace(/-(replay|live)-[0-9a-z]+$/, '');
  if (clipId && clipId !== params.id) candidates.push(join(GOLDEN_DIR, clipId, 'evidence', params.file));
  for (const path of candidates) {
    if (existsSync(path)) return new Response(readFileSync(path), { headers: { 'Content-Type': 'image/jpeg' } });
  }
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
