import { NextResponse } from "next/server";
import { readReports, writeReports, newRef } from "@/lib/store";
import { BEACHES, SPECIES_LIST } from "@/lib/types";
import type { Report } from "@/lib/types";

export async function GET() {
  const reports = await readReports();
  reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ reports });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const species = SPECIES_LIST.includes(body.species) ? body.species : "Not sure";
  const beachName = typeof body.beach === "string" && body.beach ? body.beach : "Bondi Beach";
  const beach = BEACHES.find((b) => b.name === beachName) ?? BEACHES[0];
  const now = new Date().toISOString();
  const report: Report = {
    id: `r-${Date.now()}`,
    ref: newRef(),
    species,
    beach: beach.name,
    location: typeof body.location === "string" && body.location ? body.location : beach.name,
    lat: typeof body.lat === "number" ? body.lat : beach.lat,
    lng: typeof body.lng === "number" ? body.lng : beach.lng,
    seenAt: typeof body.seenAt === "string" && body.seenAt ? body.seenAt : now,
    createdAt: now,
    sizeM: typeof body.sizeM === "number" ? body.sizeM : null,
    distanceToSwimmersM: typeof body.distanceToSwimmersM === "number" ? body.distanceToSwimmersM : null,
    notes: typeof body.notes === "string" ? body.notes : "",
    source: body.source === "DRONE_AI" || body.source === "LIFEGUARD" ? body.source : "PUBLIC",
    confidence: typeof body.confidence === "number" ? body.confidence : null,
    status: "NEW",
    reporter: typeof body.reporter === "string" && body.reporter ? body.reporter : "Anonymous",
  };
  const reports = await readReports();
  reports.unshift(report);
  await writeReports(reports);
  // In production, this is where the authority webhook / SMS / email fires.
  // For the MVP it is logged server-side and surfaced instantly in /alerts and /dashboard.
  console.log(`[SHARKWATCH ALERT] ${report.ref} ${report.species} at ${report.beach} — status NEW`);
  return NextResponse.json({ report }, { status: 201 });
}
