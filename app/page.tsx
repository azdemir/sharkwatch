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

  const [hero, ...restStages] = DESCENT_STAGES;

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
            {DESCENT_SEQUENCE.map((step) => (
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
                    <Link href="/dashboard">Authority dashboard</Link>. Those
                    pages and APIs are the existing MVP, unchanged on this
                    branch.
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
          — The Descent · TypeScript MVP · develop branch
        </span>
        <span className="descent-mono">
          Photorealistic imagery created for this page · Simulated feed ·
          Agencies simulated
        </span>
      </footer>
    </div>
  );
}
