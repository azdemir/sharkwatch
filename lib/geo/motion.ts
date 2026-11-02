// Moved from sharkwatch-vite/src/shared/geo/motion.ts (import path adjusted for Next.js).
// Speed and heading from a short history of ground positions.

import type { LocalPoint } from './project';

export interface PositionSample extends LocalPoint {
  t: number;
}

export interface Velocity {
  speedMps: number;
  headingDeg: number;
}

export function estimateVelocity(samples: PositionSample[], windowS = 2): Velocity | null {
  const last = samples.at(-1);
  if (!last) return null;
  const recent = samples.filter((s) => s.t >= last.t - windowS);
  if (recent.length < 3) return null;
  const n = recent.length;
  const meanT = recent.reduce((acc, s) => acc + s.t, 0) / n;
  let stt = 0;
  let ste = 0;
  let stn = 0;
  const meanE = recent.reduce((acc, s) => acc + s.east, 0) / n;
  const meanN = recent.reduce((acc, s) => acc + s.north, 0) / n;
  for (const s of recent) {
    const dt = s.t - meanT;
    stt += dt * dt;
    ste += dt * (s.east - meanE);
    stn += dt * (s.north - meanN);
  }
  if (stt < 1e-9) return null;
  const vEast = ste / stt;
  const vNorth = stn / stt;
  return {
    speedMps: Math.hypot(vEast, vNorth),
    headingDeg: ((Math.atan2(vEast, vNorth) * 180) / Math.PI + 360) % 360,
  };
}
