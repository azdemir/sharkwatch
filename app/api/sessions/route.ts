import { NextResponse } from 'next/server';
import { listRecordings, LiveUnavailableError, startLiveClipSession, startLiveSession, startReplaySession } from '@/components/demo/server/sessions';
import { liveSupported } from '@/components/demo/server/config';
import { loadUploadManifest, uploadDir } from '@/components/demo/server/uploads';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.mode === 'live') {
    // Fail fast on Vercel, before any session directory is written:
    // Live needs a writable, long-running server, which Vercel
    // serverless does not have, even when a Meta key is set there.
    if (!liveSupported()) {
      return NextResponse.json({ error: 'Live detection does not run on Vercel. Run the demo locally with npm run dev and a Meta key for Live; on Vercel, Replay clips work.' }, { status: 501 });
    }
    try {
      // Uploaded footage: the same Live pipeline, over the upload's manifest
      // in data/uploads/<id>/, analysed as fast as the API allows.
      if (typeof body.uploadId === 'string') {
        const manifest = loadUploadManifest(body.uploadId);
        if (!manifest) return NextResponse.json({ error: 'Unknown upload' }, { status: 404 });
        const handle = startLiveSession(manifest, body.passcode, { manifestDir: uploadDir(body.uploadId), realtime: false, locationName: 'Uploaded footage' });
        return NextResponse.json({ sessionId: handle.id, mode: 'live', clipId: handle.clipId });
      }
      const handle = startLiveClipSession(body.clipId, body.passcode);
      return NextResponse.json({ sessionId: handle.id, mode: 'live', clipId: handle.clipId });
    } catch (error) {
      if (error instanceof LiveUnavailableError) return NextResponse.json({ error: error.message }, { status: 403 });
      return NextResponse.json({ error: (error as Error).message }, { status: 404 });
    }
  }
  const speed = typeof body.speed === 'number' && body.speed > 0 && body.speed <= 8 ? body.speed : 1;
  const recordings = listRecordings();
  const recordingId = body.recording ?? recordings.find((r) => r.clipId === body.clipId)?.id;
  if (!recordingId) return NextResponse.json({ error: 'No recording for this clip' }, { status: 404 });
  // 2026-11-04 fix for Vercel 'Patrol ended with an error' every time:
  // Vercel serverless instances do not share memory, so a session created
  // by POST on instance A is invisible to the SSE GET on instance B,
  // which returned 404 'Unknown session' and closed the stream. On
  // Vercel, do NOT create an in-memory session at all: return a session
  // id in the usual '<clipId>-replay-<ts>' form, and let the SSE route
  // stream the recording statelessly from disk on whatever instance
  // serves it. Mac local keeps the in-memory path (single server).
  if (process.env.VERCEL === '1') {
    const clipId = body.clipId ?? recordings.find((r) => r.id === recordingId)?.clipId;
    if (!clipId) return NextResponse.json({ error: 'No recording for this clip' }, { status: 404 });
    return NextResponse.json({ sessionId: `${clipId}-replay-${Date.now().toString(36)}`, mode: 'replay', clipId });
  }
  try { const handle = startReplaySession(recordingId, speed); return NextResponse.json({ sessionId: handle.id, mode: 'replay', clipId: handle.clipId }); }
  catch (error) { if (error instanceof LiveUnavailableError) return NextResponse.json({ error: error.message }, { status: 403 }); return NextResponse.json({ error: (error as Error).message }, { status: 404 }); }
}
