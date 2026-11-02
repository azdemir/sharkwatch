import { NextResponse } from 'next/server';
import { listRecordings, LiveUnavailableError, startReplaySession } from '@/components/demo/server/sessions';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.mode === 'live') return NextResponse.json({ error: 'Live mode is not available in the integrated demo (one server, Replay only)' }, { status: 403 });
  const speed = typeof body.speed === 'number' && body.speed > 0 && body.speed <= 8 ? body.speed : 1;
  const recordings = listRecordings();
  const recordingId = body.recording ?? recordings.find((r) => r.clipId === body.clipId)?.id;
  if (!recordingId) return NextResponse.json({ error: 'No recording for this clip' }, { status: 404 });
  try { const handle = startReplaySession(recordingId, speed); return NextResponse.json({ sessionId: handle.id, mode: 'replay', clipId: handle.clipId }); }
  catch (error) { if (error instanceof LiveUnavailableError) return NextResponse.json({ error: error.message }, { status: 403 }); return NextResponse.json({ error: (error as Error).message }, { status: 404 }); }
}
