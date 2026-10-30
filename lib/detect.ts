import type { Detection, SpeciesName } from "./types";
import { riskFor } from "./types";

// Deterministic demo AI: same file always gives the same result, so a demo is repeatable.
// In production swap this for a real vision model (e.g. YOLO / Meta SAM + classifier)
// behind /api/detect — the page and report flow already speak this Detection shape.
const CANDIDATES: { species: SpeciesName; length: number }[] = [
  { species: "Great White", length: 4.8 },
  { species: "Hammerhead", length: 3.9 },
  { species: "Tiger", length: 4.2 },
  { species: "Bull", length: 2.8 },
  { species: "Mako", length: 3.1 },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

export function detectFromFile(fileName: string, fileSize = 0, kind = "image"): Detection {
  const lower = fileName.toLowerCase();
  const named = CANDIDATES.find((c) => lower.includes(c.species.toLowerCase().split(" ")[0].toLowerCase()) || lower.includes(c.species.toLowerCase()));
  const h = hash(`${fileName}:${fileSize}:${kind}`);
  const picked = named ?? CANDIDATES[h % CANDIDATES.length];
  const confidence = 84 + (h % 15) + (named ? 4 : 0); // 84-99, named samples score higher
  const bbox = { x: 28 + (h % 28), y: 30 + ((h >> 3) % 25), w: 34 + (h % 14), h: 22 + (h % 12) };
  const directions = ["NW", "NE", "SW", "SE", "N", "W"];
  const direction = directions[h % directions.length];
  const risk = riskFor(picked.species, Math.min(99, confidence));
  return {
    species: picked.species,
    confidence: Math.min(99, confidence),
    risk,
    bbox,
    estimatedLengthM: picked.length,
    direction,
    speedKt: 2 + (h % 5),
    action: risk === "CRITICAL" || risk === "HIGH"
      ? "Alert lifeguards immediately and clear the swim zone."
      : "Log the sighting and keep the beach under watch.",
    explanation: [
      `Top-down silhouette matched ${picked.species} shape (${kind === "video" ? "across video frames" : "in still frame"}).`,
      "Dolphin / ray / shadow patterns ruled out by fin-to-body ratio and movement.",
      `Tracking: moving ${direction} at ${2 + (h % 5)} kt, estimated ${picked.length.toFixed(1)} m.`,
    ],
    isShark: true,
  };
}
