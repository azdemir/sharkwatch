"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import type { Detection } from "@/lib/types";

const SAMPLES = [
  { label: "Try sample: Great White", file: "great-white-drone.mp4", img: "/sharks/great-white.webp" },
  { label: "Try sample: Hammerhead", file: "hammerhead-drone.mp4", img: "/sharks/hammerhead.webp" },
  { label: "Try sample: Tiger", file: "tiger-drone.mp4", img: "/sharks/tiger.webp" },
];

export default function DetectPage() {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState("");
  const [isVideo, setIsVideo] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState("");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [savedRef, setSavedRef] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function runDetect(name: string, size = 4200000, kind = "image") {
    setScanning(true); setDetection(null); setSavedRef("");
    setStep("Uploading frames…");
    await new Promise((r) => setTimeout(r, 500));
    setStep("Scanning for silhouettes, fins and shadows…");
    await new Promise((r) => setTimeout(r, 700));
    setStep("Classifying species and ruling out dolphins / rays…");
    const res = await fetch("/api/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: name, fileSize: size, kind }) });
    const data = await res.json();
    setDetection(data.detection); setScanning(false); setStep("");
  }

  function onFile(f: File) {
    setFileName(f.name); setIsVideo(f.type.startsWith("video/"));
    setPreview(URL.createObjectURL(f));
    runDetect(f.name, f.size, f.type.startsWith("video/") ? "video" : "image");
  }

  async function saveAsAlert() {
    if (!detection) return;
    const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ species: detection.species, beach: "Bondi Beach", location: "Bondi Beach, north end (drone detection)", confidence: detection.confidence, sizeM: detection.estimatedLengthM, notes: `Drone AI detection: ${detection.species}, ${detection.confidence}% confidence, moving ${detection.direction} at ${detection.speedKt} kt.`, source: "DRONE_AI" }) });
    const data = await res.json();
    setSavedRef(data.report?.ref ?? "");
  }

  return (<><AppNav /><main className="app">
    <h1>Detect a shark</h1>
    <p className="sub">Upload drone video or a still. The demo AI scans it, draws a bounding box, names the species and tells you what to do. For a real deployment, swap <code>lib/detect.ts</code> for a trained vision model — the pages and API already use its result shape.</p>

    <div className="drop" onClick={() => inputRef.current?.click()}>
      <p style={{ fontSize: 20, fontWeight: 800 }}>Drop drone footage here, or click to choose</p>
      <p style={{ opacity: 0.7, marginTop: 8 }}>Video (mp4/mov) or image (jpg/png/webp). Nothing leaves your browser except the filename for the demo classifier.</p>
      <input ref={inputRef} type="file" accept="video/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
    <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
      {SAMPLES.map((s) => (<button key={s.file} className="mini-btn" onClick={() => { setFileName(s.file); setPreview(s.img); setIsVideo(false); runDetect(s.file); }}>{s.label}</button>))}
    </div>

    {fileName && <p style={{ marginTop: 16 }}>File: <b>{fileName}</b></p>}
    {scanning && <p style={{ marginTop: 20 }}><span className="pill">Scanning…</span> {step}</p>}

    {preview && (<div className="preview">
      {isVideo ? <video src={preview} controls /> : <Image src={preview} alt="Uploaded drone footage" width={1000} height={600} unoptimized />}
      {detection && (<div className="bbox" style={{ left: `${detection.bbox.x}%`, top: `${detection.bbox.y}%`, width: `${detection.bbox.w}%`, height: `${detection.bbox.h}%` }}><span>{detection.species} — {detection.confidence}%</span></div>)}
    </div>)}

    {detection && (<section>
      <h2>{detection.species} <span className={`pill ${detection.risk === "CRITICAL" || detection.risk === "HIGH" ? "red" : "amber"}`}>{detection.risk} risk</span></h2>
      <p className="sub"><b>{detection.confidence}% confidence</b> • ~{detection.estimatedLengthM.toFixed(1)} m • moving {detection.direction} at {detection.speedKt} kt</p>
      <ul style={{ marginTop: 12, lineHeight: 1.7 }}>{detection.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul>
      <p style={{ marginTop: 16, fontWeight: 800 }}>Recommended: {detection.action}</p>
      {!savedRef ? <button className="cta" onClick={saveAsAlert}>Alert authorities from this detection →</button>
        : <p style={{ marginTop: 20 }}>Alert saved. Reference: <b>{savedRef}</b> — <Link href="/alerts">View in Alerts →</Link> · <Link href="/dashboard">Authority dashboard →</Link></p>}
      <br /><Link href="/report" className="cta secondary">Report it manually instead →</Link>
    </section>)}
  </main></>);
}
