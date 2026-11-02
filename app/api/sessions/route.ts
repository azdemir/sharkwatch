import { NextResponse } from 'next/server';
import { listRecordings, LiveUnavailableError, startLiveClipSession, startLiveSession, startReplaySession } from '@/components/demo/server/sessions';
import { loadUploadManifest, uploadDir } from '@/components/demo/server/uploads';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.mode === 'live') {
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
  try { const handle = startReplaySession(recordingId, speed); return NextResponse.json({ sessionId: handle.id, mode: 'replay', clipId: handle.clipId }); }
  catch (error) { if (error instanceof LiveUnavailableError) return NextResponse.json({ error: error.message }, { status: 403 }); return NextResponse.json({ error: (error as Error).message }, { status: 404 }); }
}
