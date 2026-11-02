// Geometry and styling for drawing detections over the video. Pure functions, unit-tested.

import { CONFIRM_FRAMES, type BoxJson, type FrameObject, type TrackSummary, type TrackVerdict } from '../../shared/events.ts';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a `srcW`×`srcH` video lands inside a `boxW`×`boxH` element with object-fit: contain. */
export function containRect(srcW: number, srcH: number, boxW: number, boxH: number): Rect & { scale: number } {
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height, scale };
}

/** Analysis frame position for a media time: integer part = frame, fraction = progress to the next. */
export function framePosition(mediaTimeS: number, fps: number): { frame: number; fraction: number } {
  const exact = Math.max(0, mediaTimeS * fps);
  const frame = Math.floor(exact + 1e-6);
  return { frame, fraction: Math.min(1, Math.max(0, exact - frame)) };
}

export function lerpBox(a: BoxJson, b: BoxJson, t: number): BoxJson {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
}

export interface DrawnObject {
  object: FrameObject;
  box: BoxJson;
}

/**
 * Objects to draw at a media time: detections of the current analysis frame, with boxes moved
 * toward the same track's next-frame box so 30 fps playback looks smooth over 10 fps analysis.
 */
export function objectsAt(frames: Map<number, FrameObject[]>, mediaTimeS: number, fps: number): DrawnObject[] {
  const { frame, fraction } = framePosition(mediaTimeS, fps);
  const current = frames.get(frame) ?? [];
  const next = frames.get(frame + 1);
  return current.map((object) => {
    const later = fraction > 0 ? next?.find((o) => o.trackId === object.trackId) : undefined;
    return { object, box: later ? lerpBox(object.box, later.box, fraction) : object.box };
  });
}

export type Tone = 'shark' | 'caution' | 'safe' | 'person' | 'neutral' | 'hidden';

/** Drawn over sea footage and on the chart: International Orange for sharks (it stands out most
 * against blue-green water), lifeguard yellow while Muse Spark checks, white for people. */
export const TONE_COLORS: Record<Exclude<Tone, 'hidden'>, string> = {
  shark: '#ff5a1f',
  caution: '#ffd23f',
  safe: '#a8e6c9',
  person: '#ffffff',
  neutral: '#b6c0c4',
};

export function toneFor(kind: 'animal' | 'person', verdict: TrackVerdict | undefined): Tone {
  if (kind === 'person') return 'person';
  switch (verdict) {
    case 'shark':
      return 'shark';
    case 'uncertain':
    case 'verifying':
    case 'pending':
    case undefined:
      return 'caution';
    case 'not_shark':
      return 'safe';
    case 'too_small':
      return 'hidden';
  }
}

export function labelFor(track: TrackSummary | undefined, kind: 'animal' | 'person'): string {
  if (kind === 'person') return 'PERSON';
  if (!track) return 'ANALYSING';
  const size = track.length && track.length.reliable !== false ? ` ${track.length.meters.toFixed(1)} m` : '';
  switch (track.verdict) {
    case 'shark':
      return `SHARK${size}`;
    case 'not_shark':
      return (track.verification?.label ?? 'not a shark').replace(/_/g, ' ').toUpperCase();
    case 'uncertain':
      return `CHECK${size}`;
    case 'verifying':
      return `VERIFYING${size}`;
    default:
      return `CANDIDATE${size}`;
  }
}

export function boxCenter(b: BoxJson): { x: number; y: number } {
  return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 };
}

/** For each confirmed shark, the closest confirmed person in the same drawn frame (pixel distance). */
export function sharkToPersonLinks(
  drawn: DrawnObject[],
  tracks: Map<string, TrackSummary>,
): { shark: DrawnObject; person: DrawnObject; distancePx: number }[] {
  const people = drawn.filter((d) => d.object.kind === 'person' && (tracks.get(d.object.trackId)?.framesSeen ?? 0) >= CONFIRM_FRAMES);
  if (people.length === 0) return [];
  return drawn
    .filter((d) => d.object.kind === 'animal' && tracks.get(d.object.trackId)?.verdict === 'shark')
    .map((shark) => {
      const s = boxCenter(shark.box);
      let best = people[0]!;
      let bestD = Infinity;
      for (const p of people) {
        const c = boxCenter(p.box);
        const d = Math.hypot(c.x - s.x, c.y - s.y);
        if (d < bestD) {
          best = p;
          bestD = d;
        }
      }
      return { shark, person: best, distancePx: bestD };
    });
}
