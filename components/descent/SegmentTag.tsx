"use client";

/* Very small segment tag for the hero SAM video, at the shark's
 * right-bottom corner. It reads video.currentTime, interpolates between
 * the two nearest points in lib/sam-segment-track.ts (positions read
 * from the SAM video itself, 0-1000 video coordinates), and maps that
 * point through the video's object-fit: cover crop, so it follows the
 * shark at any window size and pauses with the video.
 *
 * The values below are the tag's only content: type and length.
 * They are visual estimates for this generated hero video — it
 * carries no scale and no species label — so replace them with
 * confirmed values if you have them: change this one line.
 */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { SAM_SEGMENT_TRACK } from "@/lib/sam-segment-track";

const SEGMENT_LABEL = "Great White · ~3 m";

function interpolate(t: number): [number, number] {
  const frames = SAM_SEGMENT_TRACK.frames;
  if (frames.length === 0) return [0, 0];
  const loop = 10;
  const tt = ((t % loop) + loop) % loop;
  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].t <= tt) i++;
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const span = b.t - a.t || 1;
  const alpha = Math.min(1, Math.max(0, (tt - a.t) / span));
  return [
    a.right + (b.right - a.right) * alpha,
    a.bottom + (b.bottom - a.bottom) * alpha,
  ];
}

export default function SegmentTag({
  videoRef,
}: {
  videoRef?: RefObject<HTMLVideoElement>;
}) {
  const tagRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const video = videoRef?.current;
      const tag = tagRef.current;
      if (video && tag) {
        const vw = video.videoWidth || 1080;
        const vh = video.videoHeight || 720;
        const cw = video.clientWidth || 1;
        const ch = video.clientHeight || 1;
        const scale = Math.max(cw / vw, ch / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const ox = (cw - dw) / 2;
        const oy = (ch - dh) / 2;
        const [right, bottom] = interpolate(video.currentTime || 0);
        const x = ox + (right / 1000) * dw;
        const y = oy + (bottom / 1000) * dh;
        tag.style.left = `${Math.max(180, Math.min(cw - 8, x))}px`;
        tag.style.top = `${Math.max(0, Math.min(ch - 24, y))}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  return (
    <div className="hero-tracker" aria-hidden="true">
      <div
        ref={tagRef}
        className="descent-mono"
        style={{
          position: "absolute",
          transform: "translate(-100%, 0)",
          background: "rgba(4,9,15,0.75)",
          borderLeft: "2px solid #f2c200",
          color: "#e6f0f2",
          fontSize: 9,
          letterSpacing: ".08em",
          padding: "3px 6px",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {SEGMENT_LABEL}
      </div>
    </div>
  );
}
