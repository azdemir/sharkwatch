"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

// Patrol locations map: one marker per demo clip that carries a scene
// location, straight from /api/clips. No invented beaches — clips without a
// scene location are listed below the map instead of being placed on it.
const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div style={{ height: 480, display: "grid", placeItems: "center", color: "#9db4bc" }}>Loading map…</div> });

type Clip = { id: string; title: string; scene?: { beachName?: string; center?: { lat: number; lon: number } } | null };

export default function MapPage() {
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/clips").then((r) => r.json()).then((d) => setClips(Array.isArray(d) ? d : [])).catch(() => setError("Could not load patrol locations."));
  }, []);
  const placed = (clips ?? []).filter((c) => c.scene?.center);
  const unplaced = (clips ?? []).filter((c) => !c.scene?.center);
  return (
    <div className="descent-page">
      <nav className="descent-nav">
        <Link href="/" style={{ flexShrink: 0, display: "block" }}><img src="/sharkwatch-logo.svg" alt="SharkWatch" width="200" style={{ display: "block", height: "auto" }} /></Link>
        <div className="descent-nav-links">
          <Link href="/#how-it-works">How It Works</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </nav>
      <main className="contact-main">
        <h1>Patrol <em>map.</em></h1>
        <p className="contact-intro">Where the demo patrols were recorded. Locations come from the clips themselves — simulated patrols are labelled as such in their beach name.</p>
        {error ? <p style={{ color: "#ffb454" }}>{error}</p> : null}
        <div style={{ height: 480, border: "1px solid rgba(238,244,243,.18)", margin: "24px 0" }}>
          <MapView clips={placed} />
        </div>
        <div className="contact-grid">
          {placed.map((c) => (
            <div key={c.id}><div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>{c.scene?.beachName}</div><p>{c.title} — {c.scene?.center?.lat.toFixed(4)}°, {c.scene?.center?.lon.toFixed(4)}°</p></div>
          ))}
          {unplaced.map((c) => (
            <div key={c.id}><div className="descent-mono" style={{ color: "#9db4bc", marginBottom: 6, fontSize: 11 }}>No location on file</div><p>{c.title}</p></div>
          ))}
        </div>
        <p style={{ marginTop: 24 }}><Link href="/demo" className="descent-btn solid" style={{ textDecoration: "none", display: "inline-block" }}>Run a patrol in the Demo →</Link></p>
      </main>
      <footer className="descent-footer">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}><img src="/sharkwatch-logo.svg" alt="SharkWatch" width="180" style={{ flexShrink: 0, display: "block", height: "auto" }} /></div>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
          <div><div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Pages</div><div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}><Link href="/demo" style={{ color: "#9db4bc", textDecoration: "none" }}>Demo →</Link><Link href="/#how-it-works" style={{ color: "#9db4bc", textDecoration: "none" }}>How It Works →</Link><Link href="/map" style={{ color: "#9db4bc", textDecoration: "none" }}>Map →</Link><Link href="/about" style={{ color: "#9db4bc", textDecoration: "none" }}>About →</Link><Link href="/contact" style={{ color: "#9db4bc", textDecoration: "none" }}>Contact →</Link></div></div>
        </div>
        <div style={{ width: "100%", borderTop: "1px solid rgba(238,244,243,.18)", paddingTop: 16, marginTop: 8 }}><span className="descent-mono" style={{ color: "#9db4bc" }}>© 2026 SharkWatch</span></div>
      </footer>
    </div>
  );
}
