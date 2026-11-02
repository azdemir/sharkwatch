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

  return (
    <div className="descent-page">
      <nav className="descent-nav">
        <img src="/sharkwatch-logo.svg" alt="SharkWatch" width="200" style={{ flexShrink: 0, display: "block", height: "auto" }} />
        <div className="descent-nav-links">
          <Link href="/#how-it-works">How It Works</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </nav>

      <DiveStage
        stage={hero}
        isHero
        tracker
        video={DESCENT_VIDEO}
        poster={DESCENT_POSTER}
        videoPaused={videoPaused}
        videoRef={videoRef}
        onToggleVideo={toggleVideo}
        overlay={
          <>
            <h2 style={{ fontSize: "clamp(50px, 4.5vw, 100px)", margin: "0 0 12px", lineHeight: 1.00 }}>
              THE MODEL, <em style={{ fontFamily: "Palatino, Georgia, serif", fontStyle: "italic", fontWeight: 400, color: "#90e0c8" }}>not just the story.</em>
            </h2>
            <p style={{ fontSize: 16, color: "#c4d6db", lineHeight: 1.6, maxWidth: 420, margin: "0 0 20px" }}>
              SharkWatch doesn't just show you footage, it understands it. Every frame is analyzed by Meta SAM 3.1 for detection and Muse Spark for verification, so you know exactly what's in the water before any alert goes out.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>Detect</div>
                <p style={{ fontSize: 13, color: "#c4d6db", lineHeight: 1.5, margin: 0 }}>SAM 3.1 finds sharks, people, and fish in every 6-second chunk.</p>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>Verify</div>
                <p style={{ fontSize: 13, color: "#c4d6db", lineHeight: 1.5, margin: 0 }}>Muse Spark screens out dolphins, seals, rays, and kelp.</p>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>Alert</div>
                <p style={{ fontSize: 13, color: "#c4d6db", lineHeight: 1.5, margin: 0 }}>Confirmed sharks trigger alerts to lifeguards in seconds.</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/demo" className="descent-btn solid" style={{ textDecoration: "none", display: "inline-block", padding: "12px 20px", fontSize: 12 }}>
                Open Demo →
              </Link>
            </div>
          </>
        }
      />

      {/* How It Works, cinematic version: full-bleed stages starting with
          "FIRST, it is seen." (the screenshot's opening), with the old
          section's details moved into the three stages, timeline and modes
          below. Nav and footer link to /#how-it-works. */}
      <section id="how-it-works" className="how-cine">
        <div className="how-cine-stage">
          <img src="/descent/great-white.jpg" alt="Great white shark underwater" />
          <div className="how-cine-text">
            <h2>FIRST,<br /><em>it is seen.</em></h2>
            <p>
              SAM 3.1 traces it in dashed amber while Muse Spark checks it.
              People in frame are pixelated first — identification comes
              before alarm.
            </p>
            <p className="how-cine-detail">
              Drone footage is analysed in 6-second chunks, at 10 frames per
              second. A track has to be seen in 8 frames before it counts —
              a single flash of kelp or glare does not become an alert.
            </p>
          </div>
        </div>
        <div className="how-cine-stage">
          <img src="/descent/hammerhead.jpg" alt="Hammerhead shark underwater" />
          <div className="how-cine-text">
            <h2>THEN,<br /><em>it is named.</em></h2>
            <p>
              Muse Spark checks the traced contact: is it a shark, what
              species, how long is it, and how close is the nearest person?
            </p>
            <p className="how-cine-detail">
              Dolphins, seals, rays and kelp are screened out here, before
              anyone is alerted. Risk is scored from species, size, distance
              to the nearest person, swim-zone position and shore approach —
              a docile shark far offshore never becomes a critical alert.
            </p>
          </div>
        </div>
        <div className="how-cine-stage">
          <img src="/descent/tiger.jpg" alt="Tiger shark over a sandy seabed" />
          <div className="how-cine-text">
            <h2>FINALLY,<br /><em>it is acted on.</em></h2>
            <p>
              A confirmed shark becomes one alert per patrol, sent to
              lifeguards on Telegram with the evidence photo attached, in
              CAP format. They can acknowledge it or send the all-clear
              from Telegram.
            </p>
            <p className="how-cine-detail">
              A critical alert nobody acknowledges escalates after 45
              seconds. A second shark at the same level does not start a
              second alarm — it updates the open incident instead.
            </p>
          </div>
        </div>
        <div className="how-cine-close">
          <div className="how-timeline-row">
            <div><b>0.0 s</b><span>Sighted</span></div>
            <div><b>~2 s</b><span>Confirmed</span></div>
            <div><b>~5 s</b><span>Alert sent</span></div>
            <div><b>Tower 3</b><span>Acknowledged</span></div>
          </div>
          <div className="how-mode-grid">
            <div>
              <h3>Replay — free, no key</h3>
              <p>
                A recorded run of the real pipeline, at real-time speed.
                No new API calls, no cost, and the agencies in it are
                simulated — no real agency is contacted in Replay.
              </p>
            </div>
            <div>
              <h3>Live — SAM 3.1 + Muse Spark</h3>
              <p>
                Runs the models on footage as it plays, about $0.03–0.20
                per patrol, under $1 for all five recorded clips. Live is
                being ported into this one-server demo; until it lands,
                uploaded footage is preview-only.
              </p>
            </div>
          </div>
          <div className="how-cta">
            <Link href="/demo" className="descent-btn solid" style={{ textDecoration: "none", display: "inline-block" }}>
              Try the Demo →
            </Link>
            <Link href="/contact" className="descent-btn" style={{ textDecoration: "none", display: "inline-block" }}>
              Contact →
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
              <Link href="/demo" style={{ color: "#9db4bc", textDecoration: "none" }}>Demo →</Link>
              <Link href="/#how-it-works" style={{ color: "#9db4bc", textDecoration: "none" }}>How It Works →</Link>
              <Link href="/contact" style={{ color: "#9db4bc", textDecoration: "none" }}>Contact →</Link>
            </div>
          </div>
          <div>
            <div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Tech</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <span style={{ color: "#9db4bc" }}>Meta SAM 3.1</span>
              <span style={{ color: "#9db4bc" }}>Meta Muse Spark 1.3</span>
              <span style={{ color: "#9db4bc" }}>Muse Spark 1.1 Meta</span>
              <span style={{ color: "#9db4bc" }}>Muse Wonder</span>
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
