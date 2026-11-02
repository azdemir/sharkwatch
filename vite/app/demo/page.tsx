"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppNav from "@/components/AppNav";

// The full SharkWatch demo from the setup guide is a SEPARATE project from
// this Next.js MVP. It serves its web UI on port 5173 and its server on 8787,
// with Replay (five recorded patrols, free) and Live (SAM 3.1 + Muse Spark).
// This page cannot start that project itself — it lives on the viewer's own
// computer — so it links out to the viewer's localhost:5173 and checks,
// from the viewer's browser, whether that server is actually up.
const DEMO_URL = "http://localhost:5173/";

type DemoStatus = "checking" | "up" | "down";

export default function DemoPage() {
  const [status, setStatus] = useState<DemoStatus>("checking");
  const [lastChecked, setLastChecked] = useState("");

  const checkDemo = useCallback(async () => {
    setStatus("checking");
    try {
      // no-cors gives an opaque response when the server answers, and
      // rejects when nothing is listening — enough to tell up from down
      // without needing CORS headers on the 5173 server.
      await fetch(DEMO_URL, { mode: "no-cors", cache: "no-store" });
      setStatus("up");
    } catch {
      setStatus("down");
    } finally {
      setLastChecked(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => {
    void checkDemo();
  }, [checkDemo]);

  return (
    <>
      <AppNav />
      <main className="app demo-page">
        <p className="demo-eyebrow">Separate demo project · Port 5173</p>
        <h1>Open the SharkWatch demo</h1>
        <p>
          This button opens the full demo at{" "}
          <code>{DEMO_URL}</code> — Replay&apos;s five recorded patrols, the
          patrol timeline, contacts, map, beach status, and the lifeguard,
          beach-management and coastal-security consoles. Live mode there runs
          SAM 3.1 and Muse Spark and needs a Meta key; Replay is free.
        </p>

        <div className="demo-status">
          <span
            className={`demo-dot ${status}`}
            aria-label={`Demo server status: ${status}`}
          />
          {status === "checking" && "Checking your localhost:5173…"}
          {status === "up" && "Demo server is running on your computer."}
          {status === "down" && (
            <>
              Demo server is <b>not running</b> on this computer yet.
            </>
          )}
          {lastChecked ? <span> · Checked {lastChecked}</span> : null}
        </div>

        <div className="demo-actions">
          <a
            className="demo-btn solid"
            href={DEMO_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open demo →
          </a>
          <button
            type="button"
            className="demo-btn"
            onClick={() => void checkDemo()}
            disabled={status === "checking"}
          >
            Check again
          </button>
          <Link href="/" className="demo-btn">
            ← Back to The Descent
          </Link>
        </div>

        {status === "up" ? (
          <div className="demo-preview">
            <p className="demo-eyebrow">Preview — live from your localhost:5173</p>
            <iframe
              title="SharkWatch demo on localhost:5173"
              src={DEMO_URL}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
            <p>
              If the preview stays blank, open the demo in its own tab with the
              button above — some browsers block the embedded frame.
            </p>
          </div>
        ) : null}

        {status === "down" ? (
          <div className="demo-start">
            <h2>Start it first, in the demo project&apos;s folder</h2>
            <p>
              This is the <code>sharkwatch</code> folder from the setup guide —
              not this Next.js app, which runs on port 3000. In a terminal
              inside that folder:
            </p>
            <pre>
              <code>
                npm install{"\n"}
                npm run setup{"  "}# Meta key once, saved in .env only{"\n"}
                npm run dev{"  "}# wait for: Local: http://localhost:5173/
              </code>
            </pre>
            <p>
              Then come back here and press <b>Check again</b>. To stop the
              demo, press <b>Ctrl+C</b> in that terminal. If it says port 8787
              is already in use, another copy is still running — stop that one
              first. Run <code>npm run doctor</code> there if anything looks
              wrong.
            </p>
          </div>
        ) : null}

        <div className="demo-consoles">
          <h2>Demo consoles (on port 5173)</h2>
          <p>
            These open in the demo itself, once it is running — they are not
            pages of this 3000 app.
          </p>
          <ul>
            <li>
              <a href={`${DEMO_URL}console?role=lifeguards`} target="_blank" rel="noreferrer">
                Lifeguard console →
              </a>
            </li>
            <li>
              <a href={`${DEMO_URL}console?role=beach_management`} target="_blank" rel="noreferrer">
                Beach management console →
              </a>
            </li>
            <li>
              <a href={`${DEMO_URL}console?role=coastal_security`} target="_blank" rel="noreferrer">
                Coastal security console →
              </a>
            </li>
          </ul>
        </div>
      </main>
    </>
  );
}
