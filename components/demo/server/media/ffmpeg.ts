// Bundled ffmpeg/ffprobe binaries (ffmpeg-static, ffprobe-static) so the project runs the same on
// any machine with no system install. FFMPEG_PATH / FFPROBE_PATH override them if needed.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

// Resolve a binary path, never trusting a bundled value blindly: if Next
// bundles ffmpeg-static/ffprobe-static, the imported path can point at
// a file that does not exist in the built server, and spawn fails with
// a bare ENOENT. serverComponentsExternalPackages (next.config.mjs)
// keeps these packages external so the real node_modules path is used;
// this check is the second line of defence — a missing bundled path
// falls back to the system binary instead of failing cryptically.
function resolveBinary(envPath: string | undefined, staticPath: string | null | undefined, fallback: string): string {
  if (envPath) return envPath;
  if (staticPath && existsSync(staticPath)) return staticPath;
  if (staticPath) console.warn(`ffmpeg: bundled binary not found at ${staticPath}; falling back to '${fallback}' on PATH`);
  return fallback;
}

export const FFMPEG = resolveBinary(process.env.FFMPEG_PATH, ffmpegStatic as unknown as string | null, 'ffmpeg');
export const FFPROBE = resolveBinary(process.env.FFPROBE_PATH, ffprobeStatic.path, 'ffprobe');

export interface ProcessOutput {
  stdout: Buffer;
  stderr: string;
}

function run(bin: string, args: string[]): Promise<ProcessOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') reject(new Error(`${bin} not found (ENOENT) — the ffmpeg/ffprobe binary is missing at that path. If you use the bundled binaries, check node_modules/ffmpeg-static and node_modules/ffprobe-static exist, or set FFMPEG_PATH / FFPROBE_PATH to a real binary, then restart the server.`));
      else reject(e);
    });
    child.on('close', (code) => {
      const stderr = Buffer.concat(err).toString();
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

export function ffmpeg(args: string[]): Promise<ProcessOutput> {
  return run(FFMPEG, ['-hide_banner', '-y', ...args]);
}

export interface VideoInfo {
  frames: number;
  width: number;
  height: number;
}

/** Exact decoded frame count (slow on long files, fine for clips). */
export async function probeVideo(path: string): Promise<VideoInfo> {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-count_frames',
    '-show_entries', 'stream=nb_read_frames,width,height',
    '-of', 'json',
    path,
  ]);
  const stream = JSON.parse(stdout.toString()).streams?.[0];
  if (!stream) throw new Error(`no video stream in ${path}`);
  return { frames: Number(stream.nb_read_frames), width: stream.width, height: stream.height };
}

/** PSNR in dB between frame `a` of one video and frame `b` of another. */
export async function framePsnr(videoA: string, a: number, videoB: string, b: number): Promise<number> {
  const { stderr } = await ffmpeg([
    '-v', 'info',
    '-i', videoA,
    '-i', videoB,
    '-lavfi', `[0:v]select=eq(n\\,${a})[a];[1:v]select=eq(n\\,${b})[b];[a][b]psnr`,
    '-frames:v', '1',
    '-f', 'null', '-',
  ]);
  const match = /average:([\d.]+|inf)/.exec(stderr);
  return match?.[1] === 'inf' ? Infinity : Number(match?.[1] ?? 0);
}

export const H264 = ['-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-fps_mode', 'cfr'];
