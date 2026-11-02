// Draws detections onto the overlay canvas, in video pixel coordinates.

import { CONFIRM_FRAMES, type BoxJson, type FrameObject, type TrackSummary } from '../../shared/events.ts';
import { labelFor, sharkToPersonLinks, TONE_COLORS, toneFor, type DrawnObject } from './overlay.ts';

/** Shark labels drawn per frame; more overlap into clutter around a crowded float. */
const MAX_SHARK_LABELS = 4;

const pathCache = new Map<string, Path2D>();

function maskPath(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    if (pathCache.size > 4000) pathCache.clear();
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  return p;
}

/** Small offscreen canvas used to pixelate people (works in every browser, unlike ctx.filter blur). */
let pixelCanvas: HTMLCanvasElement | undefined;
const PIXEL_BLOCK = 14;

/** Pixelates the video inside a person's mask (or box), drawn in video pixel coordinates. */
function pixelate(ctx: CanvasRenderingContext2D, video: CanvasImageSource, srcW: number, srcH: number, object: FrameObject, box: BoxJson): void {
  pixelCanvas ??= document.createElement('canvas');
  const w = Math.max(1, Math.round(srcW / PIXEL_BLOCK));
  const h = Math.max(1, Math.round(srcH / PIXEL_BLOCK));
  if (pixelCanvas.width !== w || pixelCanvas.height !== h) {
    pixelCanvas.width = w;
    pixelCanvas.height = h;
  }
  const small = pixelCanvas.getContext('2d');
  if (!small) return;
  small.drawImage(video, 0, 0, w, h);

  const base = ctx.getTransform();
  const [l, t, r, b] = box;
  ctx.save();
  if (object.maskPath && object.maskSize) {
    ctx.translate(l, t);
    ctx.scale((object.box[2] - object.box[0]) / object.maskSize[0], (object.box[3] - object.box[1]) / object.maskSize[1]);
    ctx.clip(maskPath(object.maskPath));
  } else {
    ctx.beginPath();
    ctx.rect(l, t, r - l, b - t);
    ctx.clip();
  }
  ctx.setTransform(base);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pixelCanvas, 0, 0, srcW, srcH);
  ctx.restore();
}

export interface DrawOptions {
  /** Canvas pixels per CSS pixel. */
  dpr: number;
  /** Where the video sits inside the canvas, in CSS pixels, and its scale. */
  rect: { x: number; y: number; scale: number };
  drawn: DrawnObject[];
  tracks: Map<string, TrackSummary>;
  selectedId?: string;
  /** Metres per pixel, for the shark-to-swimmer distance label. */
  gsd?: number;
  /** When set, people are pixelated inside their masks (privacy). */
  privacy?: { video: CanvasImageSource; width: number; height: number };
}

export function drawOverlay(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = o.rect.scale * o.dpr;
  ctx.setTransform(s, 0, 0, s, o.rect.x * o.dpr, o.rect.y * o.dpr);
  const px = 1 / o.rect.scale; // one CSS pixel in video pixels

  // In a crowd, only the shark nearest a person (the one that drives risk) gets a full label; the
  // next few get their track number, matching the Contacts list; the rest keep their outline.
  const byRisk = o.drawn
    .filter((d) => o.tracks.get(d.object.trackId)?.verdict === 'shark')
    .sort((a, b) => (o.tracks.get(a.object.trackId)?.nearestPersonM ?? Infinity) - (o.tracks.get(b.object.trackId)?.nearestPersonM ?? Infinity))
    .map((d) => d.object.trackId);
  const fullLabel = new Set([byRisk[0], o.selectedId].filter((id): id is string => Boolean(id)));
  const sharkLabels = new Set(byRisk.slice(0, MAX_SHARK_LABELS));

  if (o.privacy) {
    for (const { object, box } of o.drawn) {
      if (object.kind === 'person') pixelate(ctx, o.privacy.video, o.privacy.width, o.privacy.height, object, box);
    }
  }

  // Shark-to-swimmer distance lines underneath everything else, for the same few sharks.
  for (const link of sharkToPersonLinks(o.drawn, o.tracks).filter((l) => fullLabel.has(l.shark.object.trackId))) {
    const a = { x: (link.shark.box[0] + link.shark.box[2]) / 2, y: (link.shark.box[1] + link.shark.box[3]) / 2 };
    const b = { x: (link.person.box[0] + link.person.box[2]) / 2, y: (link.person.box[1] + link.person.box[3]) / 2 };
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1 * px;
    ctx.setLineDash([3 * px, 3 * px]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    if (o.gsd) tag(ctx, `${(link.distancePx * o.gsd).toFixed(1)} m`, (a.x + b.x) / 2, (a.y + b.y) / 2, { fill: 'rgba(11,16,20,0.82)', ink: '#ffffff', mono: true, centered: true }, px);
    ctx.restore();
  }

  for (const { object, box } of o.drawn) {
    const track = o.tracks.get(object.trackId);
    const tone = toneFor(object.kind, track?.verdict);
    if (tone === 'hidden') continue;
    // A "person" seen in only a frame or two (a glint, kelp) is pixelated above but not announced.
    if (object.kind === 'person' && (track?.framesSeen ?? 0) < CONFIRM_FRAMES) continue;
    const color = TONE_COLORS[tone];
    const selected = object.trackId === o.selectedId;
    const confirmed = tone === 'shark';
    // Animals still being checked are traced dashed; confirmed sharks and people get a solid line.
    const dashed = !confirmed && tone !== 'safe' && object.kind !== 'person';
    const [l, t, r, b] = box;

    if (object.maskPath && object.maskSize) {
      // Masks belong to the analysis frame (not interpolated); offset them with the box.
      const sx = (object.box[2] - object.box[0]) / object.maskSize[0];
      const sy = (object.box[3] - object.box[1]) / object.maskSize[1];
      const unit = px / ((sx + sy) / 2);
      ctx.save();
      ctx.translate(l, t);
      ctx.scale(sx, sy);
      const path = maskPath(object.maskPath);
      if (object.kind !== 'person') {
        ctx.fillStyle = color;
        ctx.globalAlpha = selected ? 0.24 : confirmed ? 0.14 : 0.05;
        ctx.fill(path);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.lineWidth = (selected ? 2.5 : confirmed ? 1.5 : object.kind === 'person' ? 1.75 : 1.25) * unit;
      if (dashed) ctx.setLineDash([4 * unit, 3 * unit]);
      ctx.stroke(path);
      ctx.restore();
    }
    // Corner brackets mark the selected contact, and stand in for an outline when there is no mask.
    if (selected || !object.maskPath) brackets(ctx, l, t, r, b, color, (selected ? 2 : 1.5) * px, px);

    // Labels only where a decision is shown or needed; unverified candidates stay quiet so a
    // crowded frame (fifteen animals around a float) remains readable.
    const labelled =
      selected ||
      object.kind === 'person' ||
      sharkLabels.has(object.trackId) ||
      track?.verdict === 'uncertain' ||
      track?.verdict === 'not_shark';
    if (!labelled) continue;
    const short = tone === 'shark' && !fullLabel.has(object.trackId);
    tag(ctx, short ? object.trackId : labelFor(track, object.kind), l, t, { fill: color, ink: '#0b1014' }, px);
  }
}

/** Four corner ticks around a box, like a viewfinder locking on. */
function brackets(ctx: CanvasRenderingContext2D, l: number, t: number, r: number, b: number, color: string, width: number, px: number): void {
  const k = Math.min(10 * px, (r - l) / 3, (b - t) / 3);
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (const [x, y, dx, dy] of [
    [l, t, 1, 1],
    [r, t, -1, 1],
    [l, b, 1, -1],
    [r, b, -1, -1],
  ] as const) {
    ctx.moveTo(x + dx * k, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * k);
  }
  ctx.stroke();
  ctx.restore();
}

/** A square-cornered tag; sits on top of the point unless `centered`. Sizes are in CSS pixels. */
function tag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: { fill: string; ink: string; mono?: boolean; centered?: boolean },
  px: number,
): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = style.mono ? `${10.5 * px}px 'Fragment Mono', ui-monospace, monospace` : `700 ${11 * px}px 'Archivo Variable', ui-sans-serif, system-ui, sans-serif`;
  if ('fontStretch' in ctx && !style.mono) (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = 'condensed';
  if ('letterSpacing' in ctx && !style.mono) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${0.4 * px}px`;
  const w = ctx.measureText(text).width + 9 * px;
  const h = 16 * px;
  const left = style.centered ? x - w / 2 : x;
  const top = style.centered ? y - h / 2 : Math.max(0, y - h - 3 * px);
  ctx.fillStyle = style.fill;
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = style.ink;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + 4.5 * px, top + h / 2 + 0.5 * px);
  ctx.restore();
}
