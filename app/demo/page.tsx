"use client";

import Link from "next/link";
import { App } from "@/components/demo/web/App";

export default function DemoPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(238,244,243,.18)", background: "#011631", fontSize: 13, color: "#c4d6db" }}>
        <Link href="/" style={{ color: "#eef4f3", textDecoration: "none", fontWeight: 700 }}>← Back to SharkWatch</Link>
        <span style={{ marginLeft: 16 }}>Demo, integrated into SharkWatch on one server — Replay only, no second server.</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <App />
      </div>
    </div>
  );
}
