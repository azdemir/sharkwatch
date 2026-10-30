"use client";
import { useEffect, useState } from "react";
import AppNav from "@/components/AppNav";
import type { Report, ReportStatus } from "@/lib/types";

const ACTIONS: { label: string; status: ReportStatus }[] = [
  { label: "Verify", status: "VERIFIED" },
  { label: "Dispatch lifeguards", status: "DISPATCHED" },
  { label: "Mark cleared", status: "CLEARED" },
  { label: "False alarm", status: "FALSE_ALARM" },
];

export default function DashboardPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [broadcast, setBroadcast] = useState("");
  const [sent, setSent] = useState("");
  const load = () => fetch("/api/reports").then((r) => r.json()).then((d) => setReports(d.reports ?? []));
  useEffect(() => { load(); }, []);
  async function act(id: string, status: ReportStatus) {
    await fetch(`/api/reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }
  const n = (s: string) => reports.filter((r) => r.status === s).length;
  return (<><AppNav /><main className="app">
    <h1>Authority dashboard</h1>
    <p className="sub">For lifeguards and local authorities. Verify a sighting, dispatch a team, or close it — every change updates Alerts instantly.</p>
    <div className="statgrid">
      <div className="stat"><b>{reports.length}</b><span>Total reports</span></div>
      <div className="stat"><b>{n("NEW")}</b><span>New — needs review</span></div>
      <div className="stat"><b>{n("DISPATCHED")}</b><span>Dispatched</span></div>
      <div className="stat"><b>{reports.filter((r) => r.species !== "Not sure").length}</b><span>Identified species</span></div>
    </div>

    <div className="field"><label>Broadcast to beach (demo — logged, not sent to a real PA system)</label><input value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="e.g. Swimmers please leave the water at Bondi north end" /></div>
    <button className="cta secondary" onClick={() => { if (broadcast.trim()) { setSent(broadcast); setBroadcast(""); } }}>Send broadcast →</button>
    {sent && <p style={{ marginTop: 12 }}>Broadcast logged: “{sent}”</p>}

    <div style={{ marginTop: 32 }}>
      {reports.map((r) => (<div key={r.id} className="report-row">
        <div><b>{r.species}</b> — {r.beach} <span className="pill">{r.status}</span><p>Ref {r.ref} • {new Date(r.seenAt).toLocaleString()} • {r.location}</p><p>{r.notes || "No notes."}</p></div>
        <div>{ACTIONS.map((a) => (<button key={a.status} className="mini-btn" onClick={() => act(r.id, a.status)}>{a.label}</button>))}</div>
      </div>))}
    </div>
  </main></>);
}
