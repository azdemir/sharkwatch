import { NextResponse } from 'next/server';
import { listClips } from '@/components/demo/server/sessions';
export const dynamic = 'force-dynamic';
export async function GET() {
  const clips = listClips().map((m) => ({ id: m.id, title: m.title, durationS: m.durationS, width: m.width, height: m.height, fps: m.fps, playbackFps: m.playbackFps, playbackUrl: `/media/clips/${m.id}/playback.mp4`, source: { url: m.source.url, author: m.source.author, license: m.source.license }, scene: m.scene ?? null, demo: Boolean(m.demo) }));
  return NextResponse.json(clips);
}
