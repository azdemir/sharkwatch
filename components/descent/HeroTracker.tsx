"use client";

/* SAM-style tracker for the hero video. This is a presentation overlay, not a
 * live detection: the hero video is a fixed 10 s loop, so the box follows a
 * hand-measured path for that loop (shark small at the left at 0 s, drifting
 * right and growing as the camera pushes in, then jumping back at the loop,
 * exactly like the video itself). The dashed amber outline + cyan corner
 * brackets match the demo's SAM 3.1 overlay language, and the label says
 * SIMULATED so it never reads as a live model result. */

export default function HeroTracker({ paused = false }: { paused?: boolean }) {
  return (
    <div
      className="hero-tracker"
      aria-hidden="true"
      style={paused ? { animationPlayState: "paused" } : undefined}
    >
      <div className="hero-tracker-dash" />
      <span className="hero-tracker-corner tl" />
      <span className="hero-tracker-corner tr" />
      <span className="hero-tracker-corner bl" />
      <span className="hero-tracker-corner br" />
      <span className="hero-tracker-label">SAM 3.1 · TRACKING · SIMULATED</span>
    </div>
  );
}
