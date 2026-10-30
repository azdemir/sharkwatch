"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import { beachStatus, riskFor } from "@/lib/types";
import type { Report } from "@/lib/types";

export default function AlertsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState("ALL");
  useEffect(() => { fetch("/api/reports").then((r) => r.json()).then((d) => setReports(d.reports ?? [])); }, []);
  const status = beachStatus(reports);
  const shown = filter === "ALL" ? reports : reports.filter((r) => r.status === filter);
  return (<><AppNav /><main className="app">
    <h1>Live alerts</h1>
    <p className="sub"><span className="pill red">{status.label}</span></p>
    <p className="sub">{status.detail}</p>

    <div className="mapbox" aria-label="Sighting map">
      {reports.slice(0, 8).map((r) => {
        const b = { x: 50, y: 50 };
        // Map pins use beach coordinates normalised for this schematic coastline
        const x = ((r.lng - 110) / 50) * 100; const y = ((r.lat + 40) / 15) * 100;
        return (<span key={r.id}><span className="pin" style={{ left: `${Math.min(92, Math.max(6, x))}%`, top: `${Math.min(88, Math.max(10, y))}%` }}>📍</span><span className="pinlabel" style={{ left: `${Math.min(92, Math.max(6, x))}%`, top: `${Math.min(88, Math.max(10, y)) + 4}%` }}>{r.beach}</span></span>);
      })}
      <p style={{ position: "absolute", bottom: 12, left: 12, fontSize: 12, opacity: 0.8 }}>Schematic coastline — pins are beach locations, not exact GPS.</p>
    </div>

    <div style={{ marginTop: 24 }}>
      {["ALL", "NEW", "VERIFIED", "DISPATCHED", "CLEARED", "FALSE_ALARM"].map((f) => (<button key={f} className="mini-btn" onClick={() => setFilter(f)} style={filter === f ? { borderColor: "#00e5ff", color: "#bff6ff" } : {}}>{f}</button>))}
    </div>
    <div style={{ marginTop: 8 }}>
      {shown.map((r) => (<div key={r.id} className="report-row">
        <div><b>{r.species}</b> — {r.beach} <span className="pill">{r.status}</span> {r.confidence ? <span className="pill">{r.confidence}%</span> : null} <span className="pill">{riskFor(r.species, r.confidence ?? 85)}</span>
          <p>{r.location} • {new Date(r.seenAt).toLocaleString()} • Ref {r.ref} • Source: {r.source}</p><p>{r.notes}</p></div>
        <div><Link href="/dashboard">Manage →</Link></div>
      </div>))}
      {shown.length === 0 && <p style={{ marginTop: 20 }}>No reports in this filter yet.</p>}
    </div>
    <Link href="/report" className="cta">Report a sighting →</Link>
  </main></>);
}
