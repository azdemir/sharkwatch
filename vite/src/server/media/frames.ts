// Single-frame grabs from local video files, for crops, evidence snapshots and overlay checks.

import { ffmpeg } from './ffmpeg.ts';

const PNG_TO_STDOUT = ['-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'];

/** PNG of the frame at a zero-based index. Decodes from the start, so keep inputs short (chunks). */
export async function frameByIndex(videoPath: string, frameIndex: number): Promise<Buffer> {
  const { stdout } = await ffmpeg(['-v', 'error', '-i', videoPath, '-vf', `select=eq(n\\,${frameIndex})`, ...PNG_TO_STDOUT]);
  return stdout;
}

/** PNG of the frame shown at a timestamp. Seeks first, so it is fast on long playback files. */
export async function frameAtTime(videoPath: string, seconds: number): Promise<Buffer> {
  const { stdout } = await ffmpeg(['-v', 'error', '-ss', seconds.toFixed(3), '-i', videoPath, ...PNG_TO_STDOUT]);
  return stdout;
}
