// Uploaded footage for Live detection: stored under data/uploads/<id>/,
// never in git, never pushed anywhere. A file upload and a direct video link
// end up as the same thing — a local playback.mp4 plus a ClipManifest — so
// the exact same Live SAM/Spark pipeline runs on both. No detection is ever
// faked: if the file cannot be stored, probed, or is not a video, the caller
// gets a plain error and nothing is analysed.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';
import type { ClipManifest } from '../shared/manifest.ts';
import { DATA_DIR } from './sessions.ts';
import { chunkFileName, chunkPlan } from './media/chunks.ts';
import { FFMPEG, FFPROBE, H264, ffmpeg, probeVideo } from './media/ffmpeg.ts';

export const UPLOADS_DIR = join(DATA_DIR, 'uploads');
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const DOWNLOAD_TIMEOUT_MS = 120_000;

export function uploadDir(id: string): string {
  return join(UPLOADS_DIR, id);
}

export function newUploadId(): string {
  return `upload-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
}

export function loadUploadManifest(id: string): ClipManifest | undefined {
  if (!/^[\w-]+$/.test(id)) return undefined;
  const path = join(uploadDir(id), 'manifest.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ClipManifest) : undefined;
}

function probeFps(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate,r_frame_rate', '-of', 'json', path], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => out.push(c));
    child.stderr.on('data', (c: Buffer) => err.push(c));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${Buffer.concat(err).toString().slice(-400)}`));
      const stream = JSON.parse(Buffer.concat(out).toString()).streams?.[0];
      for (const key of ['avg_frame_rate', 'r_frame_rate']) {
        const raw = stream?.[key] as string | undefined;
        if (!raw) continue;
        const [n, d] = raw.split('/').map(Number);
        if (n && d) return resolve(n / d);
      }
      reject(new Error('could not read a frame rate from the video'));
    });
  });
}

/** Analysis fps that divides the playback fps exactly (ensureChunks needs an
 * integer decimation). Prefers 10 like every committed clip; falls back to
 * 8, 6, 5, then the playback fps itself (every frame analysed). */
function analysisFps(playbackFps: number): number {
  const rounded = Math.round(playbackFps);
  for (const fps of [10, 8, 6, 5]) {
    if (fps <= playbackFps && Number.isInteger(rounded / fps) && Math.abs(rounded / fps - playbackFps / fps) < 0.01) return fps;
  }
  return rounded;
}

/** Makes playback.mp4: an .mp4 source is moved into place, anything else is
 * re-encoded to H.264 mp4 so the browser can always play it. */
export async function normalisePlayback(dir: string, sourcePath: string): Promise<void> {
  const dest = join(dir, 'playback.mp4');
  if (sourcePath === dest) return;
  if (/\.(mp4|m4v)$/i.test(sourcePath)) {
    renameSync(sourcePath, dest);
    return;
  }
  await ffmpeg(['-v', 'error', '-i', sourcePath, ...H264, '-crf', '18', '-movflags', '+faststart', dest]);
  rmSync(sourcePath, { force: true });
}

/** Probes playback.mp4 in dir and writes the manifest the pipeline needs. */
export async function buildUploadManifest(id: string, title: string, source: { file: string; url?: string }): Promise<ClipManifest> {
  const dir = uploadDir(id);
  const playback = join(dir, 'playback.mp4');
  const info = await probeVideo(playback);
  const playbackFps = await probeFps(playback);
  const fps = analysisFps(playbackFps);
  const decimation = Math.round(playbackFps / fps);
  const frameCount = Math.ceil(info.frames / decimation);
  if (frameCount < 1) throw new Error('the video has no frames to analyse');
  const chunks = chunkPlan(frameCount, 60, 50).map((c) => ({ ...c, path: `chunks/${chunkFileName(c.index)}` }));
  const manifest: ClipManifest = {
    id,
    title,
    source,
    fps,
    playbackFps: Math.round(playbackFps),
    width: info.width,
    height: info.height,
    frameCount,
    durationS: info.frames / playbackFps,
    chunkFrames: 60,
    strideFrames: 50,
    chunks,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('127.') || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.') || ip.startsWith('fe80:')) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)(\?.*)?$/i;

/** Downloads a direct video link into data/uploads/<id>/download.bin; the
 * caller normalises it to playback.mp4 with normalisePlayback.
 * http/https only, at most 5 redirects, each hop re-checked; the host must
 * not resolve to a loopback/private address; the response must be a video
 * content-type (or, when the server sends none, a video file extension);
 * the body is capped at MAX_UPLOAD_BYTES and DOWNLOAD_TIMEOUT_MS. A watch
 * page (text/html) is rejected with a plain message, never followed silently
 * to something that is not a video. */
export async function downloadUploadVideo(id: string, videoUrl: string): Promise<{ bytes: number }> {
  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    throw new Error('that is not a valid link');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('the link must start with http:// or https://');
  const dir = uploadDir(id);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, 'download.bin');
  let bytes = 0;
  for (let hop = 0; hop <= 5; hop++) {
    const host = url.hostname;
    if (isIP(host)) {
      if (isPrivateIp(host)) throw new Error('links to private or local addresses are not downloaded');
    } else {
      const addrs = await lookup(host, { all: true }).catch(() => []);
      if (!addrs.length) throw new Error(`could not resolve ${host}`);
      if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('that link resolves to a private or local address');
    }
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }).catch((e: Error) => {
      throw new Error(`could not download that link: ${e.message}`);
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) throw new Error('that link redirected without a destination');
      url = new URL(next, url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('that link redirected away from http(s)');
      continue;
    }
    if (!res.ok) throw new Error(`that link returned ${res.status} — nothing was downloaded`);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const looksVideo = type.startsWith('video/') || (!type && VIDEO_EXT.test(url.pathname));
    if (!looksVideo) {
      throw new Error(type.startsWith('text/html') ? 'that link is a web page, not a direct video file — paste the .mp4 link itself' : `that link is not a video (server says ${type || 'unknown type'})`);
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_UPLOAD_BYTES) throw new Error('that video is over the 200 MB download limit');
    if (!res.body) throw new Error('that link returned no video data');
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(dest);
      const reader = res.body!.getReader();
      const pump = async (): Promise<void> => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_UPLOAD_BYTES) {
            out.destroy();
            throw new Error('that video is over the 200 MB download limit');
          }
          if (!out.write(value)) await new Promise((r) => out.once('drain', r));
        }
      };
      pump().then(() => out.end(resolve)).catch((e) => { out.destroy(); reject(e); });
    });
    return { bytes };
  }
  throw new Error('that link redirected too many times');
}

/** A YouTube watch / short / share link, copied from YouTube. These never end
 * in .mp4 and never point at a video file directly, so the direct-download
 * path above correctly rejects them — this path downloads them instead. */
export function isYoutubeUrl(videoUrl: string): boolean {
  try {
    const u = new URL(videoUrl);
    return u.hostname === 'youtu.be' || u.hostname.endsWith('.youtube.com') || u.hostname === 'youtube.com';
  } catch {
    return false;
  }
}

/** Downloads a YouTube link with yt-dlp into data/uploads/<id>/download.mp4.
 * yt-dlp must be installed on the machine running the server (brew install
 * yt-dlp, or pip install yt-dlp) — if it is missing, the error says so
 * plainly instead of pretending the download worked. Only use this for
 * videos you have the right to download and analyse. */
export async function downloadYoutubeVideo(id: string, videoUrl: string): Promise<{ bytes: number }> {
  const dir = uploadDir(id);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, 'download.mp4');
  const ytDlp = process.env.YT_DLP_PATH ?? 'yt-dlp';
  const ffmpegDir = FFMPEG && FFMPEG !== 'ffmpeg' ? FFMPEG.split('/').slice(0, -1).join('/') : undefined;
  const args = [
    '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/best[height<=720]',
    '--merge-output-format', 'mp4',
    '--remux-video', 'mp4',
    ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
    '--no-playlist',
    '-o', dest,
    videoUrl,
  ];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ytDlp, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const err: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, DOWNLOAD_TIMEOUT_MS);
    child.stderr.on('data', (c: Buffer) => err.push(c));
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') reject(new Error('YouTube links need yt-dlp on this Mac — install it with: brew install yt-dlp (or pip install yt-dlp), then restart npm run dev'));
      else reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('that YouTube download timed out'));
      if (code !== 0) return reject(new Error(`yt-dlp failed: ${Buffer.concat(err).toString().trim().split('\n').slice(-3).join(' ') || `exit ${code}`}`));
      resolve();
    });
  });
  const fs = await import('node:fs');
  // yt-dlp usually honours the .mp4 name above; if it fell back to another
  // container, the file lands as download.<ext> instead — take that, and
  // let normalisePlayback re-encode it to playback.mp4.
  let downloaded = dest;
  if (!fs.existsSync(downloaded)) {
    const found = fs.readdirSync(dir).find((f) => f.startsWith('download.'));
    if (!found) throw new Error('yt-dlp finished but left no video file');
    downloaded = join(dir, found);
    fs.renameSync(downloaded, dest);
    downloaded = dest;
  }
  const stat = fs.statSync(downloaded);
  if (stat.size === 0) throw new Error('yt-dlp downloaded an empty file');
  if (stat.size > MAX_UPLOAD_BYTES) throw new Error('that video is over the 200 MB download limit');
  return { bytes: stat.size };
}
