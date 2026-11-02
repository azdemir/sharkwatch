import type { SamBox } from '../meta/sam.ts';

export function boxArea(b: SamBox): number {
  return Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
}

export function iou(a: SamBox, b: SamBox): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (boxArea(a) + boxArea(b) - inter);
}

export function boxCenter(b: SamBox): { x: number; y: number } {
  return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
}

/** Linear extrapolation of a box from two earlier observations. */
export function extrapolateBox(a: SamBox, aFrame: number, b: SamBox, bFrame: number, frame: number): SamBox {
  const span = bFrame - aFrame;
  if (span <= 0) return b;
  const k = (frame - bFrame) / span;
  return {
    left: b.left + (b.left - a.left) * k,
    top: b.top + (b.top - a.top) * k,
    right: b.right + (b.right - a.right) * k,
    bottom: b.bottom + (b.bottom - a.bottom) * k,
  };
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1]! + s[mid]!) / 2;
}
