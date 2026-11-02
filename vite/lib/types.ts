export type SpeciesName = "Great White" | "Hammerhead" | "Tiger" | "Bull" | "Mako" | "Not sure";
export type ReportStatus = "NEW" | "VERIFIED" | "DISPATCHED" | "CLEARED" | "FALSE_ALARM";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Report = {
  id: string;
  ref: string;
  species: SpeciesName;
  beach: string;
  location: string;
  lat: number;
  lng: number;
  seenAt: string;
  createdAt: string;
  sizeM: number | null;
  distanceToSwimmersM: number | null;
  notes: string;
  source: "PUBLIC" | "DRONE_AI" | "LIFEGUARD";
  confidence: number | null;
  status: ReportStatus;
  reporter: string;
};

export type Detection = {
  species: SpeciesName;
  confidence: number;
  risk: RiskLevel;
  bbox: { x: number; y: number; w: number; h: number };
  estimatedLengthM: number;
  direction: string;
  speedKt: number;
  action: string;
  explanation: string[];
  isShark: boolean;
};

export const SPECIES_LIST: SpeciesName[] = ["Great White", "Hammerhead", "Tiger", "Bull", "Mako", "Not sure"];

export const BEACHES = [
  { name: "Bondi Beach", lat: -33.8915, lng: 151.2767, x: 78, y: 32 },
  { name: "Byron Bay", lat: -28.6435, lng: 153.615, x: 88, y: 18 },
  { name: "Manly Beach", lat: -33.796, lng: 151.286, x: 72, y: 38 },
  { name: "Noosa Main Beach", lat: -26.389, lng: 153.091, x: 82, y: 12 },
  { name: "Bells Beach", lat: -38.366, lng: 144.284, x: 22, y: 78 },
  { name: "Cottesloe Beach", lat: -31.998, lng: 115.751, x: 8, y: 45 },
] as const;

export function riskFor(species: SpeciesName, confidence: number): RiskLevel {
  if (species === "Not sure") return confidence >= 90 ? "MEDIUM" : "LOW";
  if (species === "Great White" || species === "Tiger" || species === "Bull") return confidence >= 90 ? "CRITICAL" : "HIGH";
  return confidence >= 90 ? "HIGH" : "MEDIUM";
}

export function beachStatus(reports: Report[]): { label: string; detail: string } {
  const active = reports.filter((r) => r.status === "VERIFIED" || r.status === "DISPATCHED" || r.status === "NEW");
  const critical = active.filter((r) => riskFor(r.species, r.confidence ?? 85) === "CRITICAL");
  if (critical.length > 0) return { label: "BEACH CLOSED — shark in swim zone", detail: `${critical.length} critical active sighting(s). Lifeguards dispatched.` };
  if (active.length > 0) return { label: "WARNING — shark sighted nearby", detail: `${active.length} active sighting(s) under review. Swim with caution.` };
  return { label: "OPEN — no active sightings", detail: "No verified or new sightings in the current feed." };
}
