"use client";
import { useState } from "react";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import { BEACHES, SPECIES_LIST } from "@/lib/types";

export default function ReportPage() {
  const [species, setSpecies] = useState("Great White");
  const [beach, setBeach] = useState("Bondi Beach");
  const [location, setLocation] = useState("Bondi Beach, north end");
  const [sizeM, setSizeM] = useState("");
  const [distance, setDistance] = useState("");
  const [notes, setNotes] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const b = BEACHES.find((x) => x.name === beach) ?? BEACHES[0];
    const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ species, beach, location, lat: b.lat, lng: b.lng, sizeM: sizeM ? Number(sizeM) : null, distanceToSwimmersM: distance ? Number(distance) : null, notes, source: "PUBLIC" }) });
    if (!res.ok) { setError("Could not send the report. Please try again."); setBusy(false); return; }
    const data = await res.json(); setRef(data.report.ref); setBusy(false);
  }

  return (<><AppNav /><main className="app">
    <h1>Report a sighting</h1>
    <p className="sub">Stay back, don&apos;t chase it, don&apos;t get in the water to film it. A 30-second report here is logged instantly for lifeguards and appears in Alerts and the authority dashboard.</p>
    {!ref ? (<form onSubmit={submit}>
      <div className="field"><label>Species</label><select value={species} onChange={(e) => setSpecies(e.target.value)}>{SPECIES_LIST.map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="field"><label>Beach</label><select value={beach} onChange={(e) => { setBeach(e.target.value); setLocation(`${e.target.value}`); }}>{BEACHES.map((b) => <option key={b.name}>{b.name}</option>)}</select></div>
      <div className="field"><label>Exact location / landmark</label><input value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="e.g. north end, near the flags" /></div>
      <div className="row">
        <div className="field"><label>Estimated size (m, optional)</label><input type="number" step="0.1" value={sizeM} onChange={(e) => setSizeM(e.target.value)} placeholder="e.g. 4.5" /></div>
        <div className="field"><label>Distance to swimmers (m, optional)</label><input type="number" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="e.g. 120" /></div>
      </div>
      <div className="field"><label>What did you see?</label><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Direction, behaviour, how close to shore…" /></div>
      {error && <p style={{ color: "#ffb3ad", marginTop: 12 }}>{error}</p>}
      <button className="cta" disabled={busy}>{busy ? "Sending…" : "Send alert to authorities →"}</button>
    </form>) : (<section>
      <h2>Alert sent ✓</h2>
      <p className="sub">Your {species} sighting at {location} was logged.</p>
      <p style={{ fontSize: 28, fontWeight: 900, marginTop: 16 }}>Reference: {ref}</p>
      <p style={{ marginTop: 16 }}><Link href="/alerts">View in Alerts →</Link> · <Link href="/dashboard">Authority dashboard →</Link></p>
      <button className="cta secondary" onClick={() => setRef("")}>Report another</button>
    </section>)}
  </main></>);
}
