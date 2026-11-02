"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DiveStage from "@/components/descent/DiveStage";
import {
  DESCENT_POSTER,
  DESCENT_STAGES,
  DESCENT_VIDEO,
} from "@/lib/descent";
import { beachStatus } from "@/lib/types";
import type { Detection, Report } from "@/lib/types";

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

  const beach = reports ? beachStatus(reports) : null;

  // Keep the original static stage copy — the model section below
  // carries the live detection data.
  const stages = DESCENT_STAGES;

  // Clean hero — just the video, no text overlay
  const hero = { ...DESCENT_STAGES[0], heading: "", headingEm: "", body: "", facts: [] };
  const restStages = DESCENT_STAGES.slice(1);

  return (
    <div className="descent-page">
      <nav className="descent-nav">
        <img src="/sharkwatch-logo.svg" alt="SharkWatch" width="200" style={{ flexShrink: 0, display: "block", height: "auto" }} />
        <span className="descent-nav-links">
          <a href="http://localhost:5173/" target="_blank" rel="noreferrer">Demo →</a>
          <Link href="/detect">Detect</Link>
          <Link href="/alerts">Alerts</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/report">Report</Link>
        </span>
      </nav>

      <DiveStage
        stage={hero}
        isHero
        video={DESCENT_VIDEO}
        poster={DESCENT_POSTER}
        videoPaused={videoPaused}
        videoRef={videoRef}
        onToggleVideo={toggleVideo}
        overlay={
          <>
            <h2 style={{ fontSize: "clamp(44px, 6vw, 88px)", margin: "0 0 12px", lineHeight: 1.05 }}>
              The model, <em style={{ fontFamily: "Palatino, Georgia, serif", fontStyle: "italic", fontWeight: 400, color: "#7fe3c8" }}>not just the story.</em>
            </h2>
            <p style={{ fontSize: 16, color: "#c4d6db", lineHeight: 1.6, maxWidth: 420, margin: "0 0 20px" }}>
              SharkWatch doesn't just show you footage — it understands it. Every frame is analyzed by Meta SAM 3.1 for detection and Muse Spark for verification, so you know exactly what's in the water before any alert goes out.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="descent-mono" style={{ color: "#7fe3c8", marginBottom: 6, fontSize: 11 }}>Detect</div>
                <p style={{ fontSize: 13, color: "#c4d6db", lineHeight: 1.5, margin: 0 }}>SAM 3.1 finds sharks, people, and fish in every 6-second chunk.</p>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="descent-mono" style={{ color: "#7fe3c8", marginBottom: 6, fontSize: 11 }}>Verify</div>
                <p style={{ fontSize: 13, color: "#c4d6db", lineHeight: 1.5, margin: 0 }}>Muse Spark screens out dolphins, seals, rays, and kelp.</p>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="descent-mono" style={{ color: "#7fe3c8", marginBottom: 6, fontSize: 11 }}>Alert</div>
                <p style={{ fontSize: 13, color: "#c4d6db", lineHeight: 1.5, margin: 0 }}>Confirmed sharks trigger alerts to lifeguards in seconds.</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="http://localhost:5173/" target="_blank" rel="noreferrer" className="descent-btn solid" style={{ textDecoration: "none", display: "inline-block", padding: "12px 20px", fontSize: 12 }}>
                Open Demo →
              </a>
              <Link href="/detect" className="descent-btn" style={{ textDecoration: "none", display: "inline-block", padding: "12px 20px", fontSize: 12 }}>
                Try Detection →
              </Link>
            </div>
          </>
        }
      />

      {restStages.map((stage) => (
        <div key={stage.id} className="descent-rv">
          <DiveStage stage={stage} />
        </div>
      ))}

      <section className="descent-abyss" id="abyss">
        <div className="descent-rv">
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
          <p className="descent-mono" style={{ marginTop: 24, color: "#7fe3c8" }}>
            From detection to alert in under 5 seconds.
          </p>
          <button
            type="button"
            className="descent-btn solid"
            onClick={() => jumpTo("return")}
            style={{ marginTop: 28 }}
          >
            ↥ Return to the surface
          </button>
        </div>
      </section>

      <section className="descent-return" id="return">
        <div className="descent-rv">
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
          <div style={{ marginTop: 32, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <a
              href="http://localhost:5173/"
              target="_blank"
              rel="noreferrer"
              className="descent-btn solid"
              style={{ textDecoration: "none", display: "inline-block" }}
            >
              Try the Demo →
            </a>
            <Link href="/detect" className="descent-btn" style={{ textDecoration: "none", display: "inline-block" }}>
              Detect a Shark →
            </Link>
            <Link href="/report" className="descent-btn" style={{ textDecoration: "none", display: "inline-block" }}>
              Report a Sighting →
            </Link>
          </div>
        </div>
      </section>

      <footer className="descent-footer">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          <img src="/sharkwatch-logo.svg" alt="SharkWatch" width="180" style={{ flexShrink: 0, display: "block", height: "auto" }} />

        </div>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
          <div>
            <div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Pages</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <a href="http://localhost:5173/" target="_blank" rel="noreferrer" style={{ color: "#9db4bc", textDecoration: "none" }}>Demo (5173) →</a>
              <Link href="/detect" style={{ color: "#9db4bc", textDecoration: "none" }}>Detect →</Link>
              <Link href="/report" style={{ color: "#9db4bc", textDecoration: "none" }}>Report →</Link>
              <Link href="/alerts" style={{ color: "#9db4bc", textDecoration: "none" }}>Alerts →</Link>
              <Link href="/dashboard" style={{ color: "#9db4bc", textDecoration: "none" }}>Dashboard →</Link>
            </div>
          </div>
          <div>
            <div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Tech</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <span style={{ color: "#9db4bc" }}>Meta SAM 3.1</span>
              <span style={{ color: "#9db4bc" }}>Meta Muse Spark 1.3</span>
              <span style={{ color: "#9db4bc" }}>Next.js 14 + TypeScript</span>
              <span style={{ color: "#9db4bc" }}>Fastify + SSE</span>
            </div>
          </div>
          <div>
            <div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Info</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <span style={{ color: "#9db4bc" }}>Node 22.12+</span>
              <span style={{ color: "#9db4bc" }}>Replay: free, no keys</span>
              <span style={{ color: "#9db4bc" }}>Live: ~$0.03–0.20/patrol</span>
              <span style={{ color: "#9db4bc" }}>MIT License</span>
            </div>
          </div>
        </div>
        <div style={{ width: "100%", borderTop: "1px solid rgba(238,244,243,.18)", paddingTop: 16, marginTop: 8, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <span className="descent-mono" style={{ color: "#9db4bc" }}>
            © 2026 SharkWatch
          </span>
        </div>
      </footer>
    </div>
  );
}
