import { NextResponse } from "next/server";
import { readReports, writeReports } from "@/lib/store";
import type { ReportStatus } from "@/lib/types";

const VALID: ReportStatus[] = ["NEW", "VERIFIED", "DISPATCHED", "CLEARED", "FALSE_ALARM"];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  if (!VALID.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const reports = await readReports();
  const idx = reports.findIndex((r) => r.id === params.id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  reports[idx] = { ...reports[idx], status: body.status };
  await writeReports(reports);
  return NextResponse.json({ report: reports[idx] });
}
