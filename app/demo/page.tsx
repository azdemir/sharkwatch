"use client";

import { App } from "@/components/demo/web/App";

export default function DemoPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <App />
      </div>
    </div>
  );
}
