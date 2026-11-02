import { promises as fs } from "fs";
import path from "path";
import type { Report } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "reports.json");

const SEED: Report[] = [
  { id: "seed-1", ref: "SW-4821-2026", species: "Great White", beach: "Bondi Beach", location: "Bondi Beach, north end", lat: -33.8915, lng: 151.2767, seenAt: "2026-10-30T08:12:00Z", createdAt: "2026-10-30T08:14:00Z", sizeM: 4.8, distanceToSwimmersM: 120, notes: "Drone 07, top-down, moving NW. Swimmers cleared.", source: "DRONE_AI", confidence: 98, status: "DISPATCHED", reporter: "Drone 07" },
  { id: "seed-2", ref: "SW-4790-2026", species: "Hammerhead", beach: "Byron Bay", location: "Byron Bay, The Pass", lat: -28.6435, lng: 153.615, seenAt: "2026-10-29T16:40:00Z", createdAt: "2026-10-29T16:42:00Z", sizeM: 3.9, distanceToSwimmersM: 300, notes: "Deep water, no swimmers nearby. Under watch.", source: "LIFEGUARD", confidence: 91, status: "VERIFIED", reporter: "Lifeguard tower" },
  { id: "seed-3", ref: "SW-4712-2026", species: "Tiger", beach: "Manly Beach", location: "Manly Beach, south end", lat: -33.796, lng: 151.286, seenAt: "2026-10-29T10:05:00Z", createdAt: "2026-10-29T10:07:00Z", sizeM: 4.2, distanceToSwimmersM: 200, notes: "Public photo, verified against drone clip.", source: "PUBLIC", confidence: 88, status: "CLEARED", reporter: "Beachgoer" },
  { id: "seed-4", ref: "SW-4688-2026", species: "Not sure", beach: "Noosa Main Beach", location: "Noosa Main Beach", lat: -26.389, lng: 153.091, seenAt: "2026-10-28T14:20:00Z", createdAt: "2026-10-28T14:22:00Z", sizeM: null, distanceToSwimmersM: null, notes: "Possible shadow / ray. Reviewed and closed.", source: "PUBLIC", confidence: 54, status: "FALSE_ALARM", reporter: "Beachgoer" },
];

export async function readReports(): Promise<Report[]> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED;
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(SEED, null, 2));
    return SEED;
  }
}

export async function writeReports(reports: Report[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(reports, null, 2));
}

export function newRef(): string {
  return `SW-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getFullYear()}`;
}
