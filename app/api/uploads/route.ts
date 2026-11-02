import { NextResponse } from 'next/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveAvailable } from '@/components/demo/server/config';
import { buildUploadManifest, downloadUploadVideo, downloadYoutubeVideo, isYoutubeUrl, MAX_UPLOAD_BYTES, newUploadId, normalisePlayback, uploadDir } from '@/components/demo/server/uploads';

export const dynamic = 'force-dynamic';

type Manifest = Awaited<ReturnType<typeof buildUploadManifest>>;

function clipInfo(manifest: Manifest, sourceUrl?: string) {
  return {
    id: manifest.id,
    title: manifest.title,
    durationS: manifest.durationS,
    width: manifest.width,
    height: manifest.height,
    fps: manifest.fps,
    playbackFps: manifest.playbackFps,
    playbackUrl: `/api/uploads/${manifest.id}/file`,
    source: { url: sourceUrl, file: manifest.source.file },
    scene: null,
    demo: false,
  };
}

function cleanTitle(name: string, fallback: string): string {
  const base = name.split(/[\/]/).pop()?.trim();
  return base ? base.slice(0, 120) : fallback;
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') return NextResponse.json({ error: 'No video file was uploaded' }, { status: 400 });
      if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'That video is over the 200 MB upload limit' }, { status: 413 });
      if (file.size === 0) return NextResponse.json({ error: 'That file is empty' }, { status: 400 });
      const isVideo = file.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv)$/i.test(file.name);
      if (!isVideo) return NextResponse.json({ error: 'Please upload a video file' }, { status: 400 });
      const id = newUploadId();
      const dir = uploadDir(id);
      mkdirSync(dir, { recursive: true });
      const ext = /\.(mp4|m4v|mov|webm|mkv)$/i.exec(file.name)?.[0] ?? '.bin';
      const original = join(dir, `original${ext}`);
      writeFileSync(original, Buffer.from(await file.arrayBuffer()));
      await normalisePlayback(dir, original);
      const manifest = await buildUploadManifest(id, cleanTitle(file.name, 'Uploaded footage'), { file: file.name });
      return NextResponse.json({ uploadId: id, clip: clipInfo(manifest), liveAvailable: liveAvailable() });
    }
    const body = await req.json().catch(() => ({}));
    const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
    if (!videoUrl) return NextResponse.json({ error: 'Send a file, or a JSON body with a videoUrl' }, { status: 400 });
    const id = newUploadId();
    if (isYoutubeUrl(videoUrl)) {
      await downloadYoutubeVideo(id, videoUrl);
      await normalisePlayback(uploadDir(id), join(uploadDir(id), 'download.mp4'));
    } else {
      await downloadUploadVideo(id, videoUrl);
      await normalisePlayback(uploadDir(id), join(uploadDir(id), 'download.bin'));
    }
    const manifest = await buildUploadManifest(id, cleanTitle(videoUrl, 'Linked footage'), { file: 'downloaded video', url: videoUrl });
    return NextResponse.json({ uploadId: id, clip: clipInfo(manifest), liveAvailable: liveAvailable(), sourceUrl: videoUrl });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
