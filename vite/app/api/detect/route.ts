import { NextResponse } from "next/server";
import { detectFromFile } from "@/lib/detect";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const fileName = typeof body.fileName === "string" && body.fileName ? body.fileName : "drone-footage.mp4";
  const detection = detectFromFile(fileName, typeof body.fileSize === "number" ? body.fileSize : 0, body.kind ?? "image");
  return NextResponse.json({ detection, fileName });
}
