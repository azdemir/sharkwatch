"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DepthMeter from "@/components/descent/DepthMeter";
import DiveStage from "@/components/descent/DiveStage";
import {
  DESCENT_POSTER,
  DESCENT_SEQUENCE,
  DESCENT_STAGES,
  DESCENT_VIDEO,
} from "@/lib/descent";
import { beachStatus } from "@/lib/types";
import type { Detection, Report } from "@/lib/types";

const BUBBLES = [
  { left: "8%", size: 10, dur: 14, delay: 0 },
  { left: "22%", size: 6, dur: 19, delay: 3 },
  { left: "68%", size: 12, dur: 16, delay: 1 },
  { left: "86%", size: 7, dur: 22, delay: 5 },
  { left: "45%", size: 9, dur: 18, delay: 2 },
];

const DEPTH_TARGETS = [
  { id: "surface", label: "0 m — Surface" },
  { id: "d10", label: "10 m — Great White" },
  { id: "d30", label: "30 m — Hammerhead" },
  { id: "d80", label: "80 m — Tiger" },
  { id: "abyss", label: "200 m — Abyss" },
  { id: "return", label: "↥ Return" },
];

export default function Home() {
  const [progress, setProgress] = useState(0);
  const [videoPaused, setVideoPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Wired to the existing MVP model (master branch code, unchanged on dev):
  // lib/detect.ts via POST /api/detect, and lib/store.ts via GET /api/reports.
  // Nothing is created automatically — logging a report only happens when
  // the user presses the button below, so loading the landing is side-effect free.
  const [reports, setReports] = useState<Report[] | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState("");
  const [loggingBusy, setLoggingBusy] = useState(false);
  const [loggedRef, setLoggedRef] = useState("");

  const loadModel = async () => {
    setModelLoading(true);
    setModelError("");
    try {
      const [reportsRes, detectRes] = await Promise.all([
        fetch("/api/reports"),
        fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: "great-white.jpg",
            fileSize: 0,
            kind: "image",
          }),
        }),
      ]);
      if (!reportsRes.ok || !detectRes.ok) {
        throw new Error("Model APIs did not respond");
      }
      const reportsData = await reportsRes.json();
      const detectData = await detectRes.json();
      setReports(Array.isArray(reportsData.reports) ? reportsData.reports : []);
      setDetection(detectData.detection ?? null);
    } catch {
      // Fall back to the static Descent copy — the page must never break
      // just because the model APIs are unreachable.
      setModelError("Model APIs unreachable — showing the static Descent copy.");
    } finally {
      setModelLoading(false);
    }
  };

  useEffect(() => {
    void loadModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logDetectionAsReport = async () => {
    if (!detection) return;
    setLoggingBusy(true);
    setLoggedRef("");
    try {
      const beach = reports?.find((r) =>
        ["NEW", "VERIFIED", "DISPATCHED"].includes(r.status),
      )?.beach;
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          species: detection.species,
          beach: beach ?? "Bondi Beach",
          source: "DRONE_AI",
          confidence: detection.confidence,
          sizeM: detection.estimatedLengthM,
          notes: `Demo detection from the Descent landing: ${detection.explanation[0] ?? ""}`,
        }),
      });
      const data = await res.json();
      if (data.report?.ref) {
        setLoggedRef(data.report.ref);
        const refreshed = await fetch("/api/reports");
        const refreshedData = await refreshed.json();
        setReports(
          Array.isArray(refreshedData.reports) ? refreshedData.reports : [],
        );
      }
    } catch {
      setModelError("Could not log that detection as a report.");
    } finally {
      setLoggingBusy(false);
    }
  };

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max =
          document.documentElement.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? window.scrollY / max : 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    document.querySelectorAll(".descent-rv").forEach((el) => {
      observer.observe(el);
    });
    const timer = setTimeout(() => {
      document.querySelectorAll(".descent-rv").forEach((el) => {
        el.classList.add("in");
      });
    }, 1500);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  const depthLabel =
    progress < 0.12
      ? "Surface · 0 m"
      : `Depth · ${Math.round(progress * 200)} m`;

  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setVideoPaused(false);
    } else {
      video.pause();
      setVideoPaused(true);
    }
  };

  const activeReport = reports?.find((r) =>
    ["NEW", "VERIFIED", "DISPATCHED"].includes(r.status),
  );
  const latestReport = reports?.[0];
  const beach = reports ? beachStatus(reports) : null;

  // Stage facts become model-derived when the model has answered, and
  // stay on the original static copy while it loads or if it fails.
  const stages = DESCENT_STAGES.map((stage) => {
    if (stage.id === "d10" && detection) {
      return {
        ...stage,
        facts: [
          { label: "Model — detected", value: detection.isShark ? "Shark" : "Not a shark" },
          { label: "Species", value: detection.species },
          { label: "Confidence", value: `${detection.confidence}%` },
          { label: "Length", value: `${detection.estimatedLengthM.toFixed(1)} m` },
        ],
      };
    }
    if (stage.id === "d30" && detection) {
      return {
        ...stage,
        facts: [
          { label: "Species", value: detection.species },
          { label: "Confidence", value: `${detection.confidence}%` },
          { label: "Risk", value: detection.risk },
          { label: "Moving", value: `${detection.direction} · ${detection.speedKt} kt` },
        ],
      };
    }
    if (stage.id === "d80" && beach && activeReport) {
      return {
        ...stage,
        facts: [
          { label: "Beach status", value: beach.label },
          { label: "Latest report", value: activeReport.ref },
          { label: "Species", value: activeReport.species },
        ],
      };
    }
    return stage;
  });

  const sequence =
    detection && latestReport
      ? [
          { label: "Sighted", value: latestReport.species },
          { label: "Confirmed", value: `${detection.confidence}%` },
          { label: "Alert sent", value: latestReport.status },
          { label: "Acknowledged", value: latestReport.ref },
        ]
      : DESCENT_SEQUENCE;

  const [hero, ...restStages] = stages;

  return (
    <div className="descent-page">
      <nav className="descent-nav">
        <b>SHARKWATCH</b>
        <span className="descent-mono">The Descent · Simulated feed</span>
        <span className="descent-nav-links">
          <Link href="/detect">Detect</Link>
          <Link href="/alerts">Alerts</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/report">Report</Link>
        </span>
      </nav>

      <DepthMeter
        depthLabel={depthLabel}
        progress={progress}
        targets={DEPTH_TARGETS}
        activeId=""
        onJump={jumpTo}
      />

      <div className="descent-bubbles" aria-hidden>
        {BUBBLES.map((bubble, i) => (
          <span
            key={i}
            style={{
              left: bubble.left,
              width: bubble.size,
              height: bubble.size,
              animationDuration: `${bubble.dur}s`,
              animationDelay: `${bubble.delay}s`,
            }}
          />
        ))}
      </div>

      <DiveStage
        stage={hero}
        isHero
        video={DESCENT_VIDEO}
        poster={DESCENT_POSTER}
        videoPaused={videoPaused}
        videoRef={videoRef}
        onToggleVideo={toggleVideo}
      />

      <section className="descent-model" id="model">
        <div className="descent-rv">
          <div className="descent-mono" style={{ color: "#9db4bc" }}>
            Model · Live on this page · Demo detector, not a real SAM model
          </div>
          <h2>
            The model, <em>not just the story.</em>
          </h2>
          <p>
            This section reads the same code the Detect page uses:{" "}
            <code>lib/detect.ts</code> through <code>POST /api/detect</code>{" "}
            and <code>lib/store.ts</code> through <code>GET /api/reports</code>.
            The stages below now carry these numbers instead of hardcoded copy.
          </p>
          {modelLoading ? (
            <p className="descent-mono" style={{ marginTop: 28 }}>
              Running demo detection…
            </p>
          ) : modelError && !detection && !reports ? (
            <p className="descent-mono" style={{ marginTop: 28 }}>
              {modelError}
            </p>
          ) : (
            <>
              {detection ? (
                <div className="descent-model-grid descent-mono">
                  <div>
                    Species<span><b>{detection.species}</b></span>
                  </div>
                  <div>
                    Confidence<span><b>{detection.confidence}%</b></span>
                  </div>
                  <div>
                    Risk<span><b>{detection.risk}</b></span>
                  </div>
                  <div>
                    Length<span><b>{detection.estimatedLengthM.toFixed(1)} m</b></span>
                  </div>
                  <div>
                    Tracking<span><b>{detection.direction} · {detection.speedKt} kt</b></span>
                  </div>
                  <div>
                    Box<span><b>{detection.bbox.x}, {detection.bbox.y} · {detection.bbox.w}×{detection.bbox.h}</b></span>
                  </div>
                </div>
              ) : null}
              {detection ? <p>{detection.action}</p> : null}
              {latestReport ? (
                <p className="descent-mono" style={{ marginTop: 20 }}>
                  Latest report: {latestReport.ref} · {latestReport.species} ·{" "}
                  {latestReport.beach} · {latestReport.status}
                </p>
              ) : null}
              {beach ? (
                <p className="descent-mono" style={{ marginTop: 8 }}>
                  Beach status: {beach.label} — {beach.detail}
                </p>
              ) : null}
              <div style={{ marginTop: 28, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="descent-btn"
                  onClick={() => void loadModel()}
                  disabled={modelLoading}
                >
                  Re-run detection
                </button>
                <button
                  type="button"
                  className="descent-btn solid"
                  onClick={() => void logDetectionAsReport()}
                  disabled={!detection || loggingBusy}
                >
                  {loggingBusy ? "Logging…" : "Log this detection as a report"}
                </button>
                <Link href="/detect" className="descent-btn" style={{ textDecoration: "none", display: "inline-block" }}>
                  Open Detect →
                </Link>
              </div>
              {loggedRef ? (
                <p className="descent-mono" style={{ marginTop: 20 }}>
                  Logged as {loggedRef} — it now appears in Alerts and Dashboard.
                </p>
              ) : null}
              {modelError ? (
                <p className="descent-mono" style={{ marginTop: 20 }}>{modelError}</p>
              ) : null}
            </>
          )}
        </div>
      </section>

      {restStages.map((stage) => (
        <div key={stage.id} className="descent-rv">
          <DiveStage stage={stage} />
        </div>
      ))}

      <section className="descent-abyss" id="abyss">
        <div className="descent-rv">
          <div className="descent-mono" style={{ color: "#9db4bc" }}>
            200 m · Abyss · Almost no light
          </div>
          <h2>
            The beach is the surface.
            <br />
            <em>We watch below it.</em>
          </h2>
          <p>
            A lifeguard answers as Tower 3, presses Acknowledge, and the main
            screen shows the tick. All clear closes it, with CAP XML marked as
            an exercise — always.
          </p>
          <div className="descent-seq descent-mono">
            {sequence.map((step) => (
              <div key={step.label}>
                {step.label}
                <span>
                  <b>{step.value}</b>
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="descent-btn solid"
            onClick={() => jumpTo("return")}
          >
            ↥ Return to the surface
          </button>
        </div>
      </section>

      <section className="descent-return" id="return">
        <div className="descent-rv">
          <div className="descent-mono" style={{ color: "#9db4bc" }}>
            Back on shore · Light returns
          </div>
          <h2>
            You came back up.
            <br />
            <em>Now run it yourself.</em>
          </h2>
          <p>
            Replay is a recorded run of the real pipeline, at real-time speed,
            free with no key. Live runs SAM 3.1 and Muse Spark on the footage
            as it plays, about $0.03–0.20 per patrol, under $1 for all five
            clips.
          </p>
          <div className="descent-grid">
            <div className="descent-term">
              <b>$</b> npm install
              <br />
              <b>$</b> npm run setup{" "}
              <span style={{ color: "#8fa8b0" }}>
                # Meta key once, saved in .env only
              </span>
              <br />
              <b>$</b> npm run dev{" "}
              <span style={{ color: "#8fa8b0" }}>
                # localhost:3000 in this MVP
              </span>
              <br />
              <br />
              <span style={{ color: "#8fa8b0" }}>
                Node 22.12+ · 22, 24, 26 work · avoid 23, 25 · stop with Ctrl+C
              </span>
            </div>
            <div>
              <div className="descent-step">
                <div className="descent-step-n">01</div>
                <div>
                  <h4>Telegram</h4>
                  <p>
                    Message <code>@BotFather</code>, send <code>/newbot</code>,
                    paste the token in <code>npm run setup</code>, restart,
                    scan the QR under Beach status and send <code>/start</code>.
                    One bot per running copy.
                  </p>
                </div>
              </div>
              <div className="descent-step">
                <div className="descent-step-n">02</div>
                <div>
                  <h4>Try the MVP, not just the landing</h4>
                  <p>
                    <Link href="/detect">Detect</Link> a sample,{" "}
                    <Link href="/report">file a report</Link>, watch it in{" "}
                    <Link href="/alerts">Alerts</Link>, and manage it in the{" "}
                    <Link href="/dashboard">Authority dashboard</Link>. The
                    landing above now reads those same APIs, instead of
                    hardcoded copy.
                  </p>
                </div>
              </div>
              <div className="descent-step">
                <div className="descent-step-n">03</div>
                <div>
                  <h4>If it breaks</h4>
                  <p>
                    Run <code>npm run build</code> to verify the TypeScript
                    build.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="descent-footer">
        <span>
          <b style={{ letterSpacing: ".22em", fontSize: 13, color: "#fff" }}>
            SHARKWATCH
          </b>{" "}
          — The Descent · TypeScript MVP · dev branch · model wired in
        </span>
        <span className="descent-mono">
          Photorealistic imagery created for this page · Simulated feed ·
          Agencies simulated
        </span>
      </footer>
    </div>
  );
}
