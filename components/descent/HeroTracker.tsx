"use client";

/* Hero shark tracker, driven by the video itself — not a CSS loop.
 *
 * How it works, and why this is different from the old version:
 * - The track data in lib/hero-track.ts was made once, offline, by running
 *   a local segmentation model (U2Net, ONNX Runtime, no API, no network
 *   call at runtime) over the fixed 10 s hero video, frame by frame.
 *   Each frame is the model's actual shark contour for that moment:
 *   snout, dorsal fin, pectoral fin, tail, tail sway included.
 * - At runtime the site makes no model or API call at all. It reads
 *   video.currentTime, interpolates between the two nearest model
 *   frames, and draws that dotted contour. If the video pauses or
 *   buffers, the outline pauses with it — it cannot drift away from
 *   the shark the way a 10 s CSS animation could.
 * - The contour is stored in video coordinates (0-1000). On every
 *   frame it is mapped through the video's object-fit: cover crop,
 *   so it lands on the shark whatever the window's aspect ratio is.
 *   That crop mapping is what the old version was missing on wide
 *   screens: the video was cropped top/bottom, but the outline was
 *   positioned in stage coordinates, so it stretched and sat low.
 *
 * The label still says SIMULATED: this is a precomputed track for a
 * fixed loop, not a live detection running on the page.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { HERO_TRACK } from "@/lib/hero-track";

type Pt = [number, number];

function interpolate(t: number): Pt[] {
  const frames = HERO_TRACK.frames;
  if (frames.length === 0) return [];
  const loop = 10;
  const tt = ((t % loop) + loop) % loop;
  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].t <= tt) i++;
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const span = b.t - a.t || 1;
  const alpha = Math.min(1, Math.max(0, (tt - a.t) / span));
  return a.points.map(([x, y], k) => {
    const [bx, by] = b.points[k] ?? [x, y];
    return [x + (bx - x) * alpha, y + (by - y) * alpha] as Pt;
  });
}

function pathFrom(points: Pt[]): string {
  if (points.length === 0) return "";
  const d = points.map(([x, y], k) => `${k === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return `${d} Z`;
}

export default function HeroTracker({
  videoRef,
}: {
  videoRef?: RefObject<HTMLVideoElement>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const video = videoRef?.current;
      const svg = svgRef.current;
      const path = pathRef.current;
      if (video && svg && path) {
        const vw = video.videoWidth || 1152;
        const vh = video.videoHeight || 768;
        const cw = video.clientWidth || 1;
        const ch = video.clientHeight || 1;
        const scale = Math.max(cw / vw, ch / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const ox = (cw - dw) / 2;
        const oy = (ch - dh) / 2;
        const pts = interpolate(video.currentTime || 0);
        const mapped: Pt[] = pts.map(([x, y]) => [
          ox + (x / 1000) * dw,
          oy + (y / 1000) * dh,
        ]);
        svg.setAttribute("viewBox", `0 0 ${cw} ${ch}`);
        path.setAttribute("d", pathFrom(mapped));
        if (labelRef.current && mapped.length > 0) {
          const xs = mapped.map((p) => p[0]);
          const ys = mapped.map((p) => p[1]);
          labelRef.current.style.left = `${Math.max(0, Math.max(...xs) - 210)}px`;
          labelRef.current.style.top = `${Math.max(...ys) + 8}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  return (
    <div className="hero-tracker" aria-hidden="true">
      <svg ref={svgRef} className="hero-tracker-outline" preserveAspectRatio="none">
        <path
          ref={pathRef}
          fill="none"
          stroke="#ffb454"
          strokeWidth="2.5"
          strokeDasharray="0.1 7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span ref={labelRef} className="hero-tracker-label">
        SAM 3.1 · TRACKING · SIMULATED
      </span>
    </div>
  );
}
