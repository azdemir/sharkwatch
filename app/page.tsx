"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Species = {
  name: string;
  latin: string;
  risk: string;
  length: string;
  img: string;
  note: string;
};

const SPECIES: Species[] = [
  { name: "Great White", latin: "Carcharodon carcharias", risk: "HIGH", length: "Up to 6.1 m", img: "/sharks/great-white.webp", note: "The classic surface hunter. Drone AI flags its torpedo silhouette and white belly in seconds." },
  { name: "Hammerhead", latin: "Sphyrna mokarran", risk: "MEDIUM", length: "Up to 6.0 m", img: "/sharks/hammerhead.webp", note: "Impossible to miss from above — that T-shaped head is a perfect AI fingerprint in deep water." },
  { name: "Tiger", latin: "Galeocerdo cuvier", risk: "HIGH", length: "Up to 5.5 m", img: "/sharks/tiger.webp", note: "Striped, curious, and coastal. Tiger sharks trigger instant beach alerts when they enter swim zones." },
];

const BUBBLES = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 41) % 100}%`,
  size: 6 + ((i * 13) % 22),
  dur: 11 + ((i * 7) % 18),
  delay: (i % 9) * 1.3,
}));

export default function Home() {
  const [depth, setDepth] = useState(0);
  const [clock, setClock] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [species, setSpecies] = useState("Great White");
  const [location, setLocation] = useState("");
  const [sentRef, setSentRef] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Camera zoom on scroll: every .scene scales / fades by distance from viewport centre.
  // The fixed ocean also deepens (CSS var --depth) as you dive down the page.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? window.scrollY / max : 0;
        setDepth(p);
        document.documentElement.style.setProperty("--depth", String(p));
        const bar = document.getElementById("progress");
        if (bar) bar.style.width = `${p * 100}%`;
        document.querySelectorAll<HTMLElement>(".scene").forEach((el) => {
          const r = el.getBoundingClientRect();
          const centre = r.top + r.height / 2 - window.innerHeight / 2;
          const dist = Math.min(1, Math.abs(centre) / window.innerHeight);
          const scale = 1.18 - dist * 0.32; // zooming through: big on entry, settles, shrinks on exit
          const opacity = 1 - dist * 0.45;
          el.style.transform = `scale(${scale})`;
          el.style.opacity = String(Math.max(0.35, opacity));
        });
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
    const tick = () => setClock(new Date().toLocaleTimeString());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const sendReport = async () => {
    try {
      const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ species, location, source: "PUBLIC" }) });
      const data = await res.json();
      setSentRef(data.report?.ref ?? `SW-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getFullYear()}`);
    } catch {
      setSentRef(`SW-${Math.floor(1000 + Math.random() * 9000)}-${new Date().getFullYear()}`);
    }
  };

  return (
    <div ref={rootRef}>
      <div id="progress" className="progress" />
      <nav className="nav">
        <a href="#top">Sharkwatch ◉</a>
        <span><Link href="/detect" style={{ marginRight: 16 }}>Detect</Link><Link href="/alerts" style={{ marginRight: 16 }}>Alerts</Link><Link href="/dashboard">Dashboard</Link></span>
        <a href="#report" onClick={(e) => { e.preventDefault(); setReportOpen(true); }}>Report →</a>
      </nav>

      {/* Infinite ocean background */}
      <div className="ocean-fixed" aria-hidden>
        <div className="rays" />
        {BUBBLES.map((b, i) => (
          <span key={i} className="bubble" style={{ left: b.left, width: b.size, height: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }} />
        ))}
        <div className="wave" /><div className="wave w2" />
      </div>

      {/* 01 — HERO / SURFACE */}
      <section className="scene" id="top">
        <div className="scene-inner">
          <p className="eyebrow">Live drone footage • AI detection • 24/7 coast watch</p>
          <h1 className="giant">Shark<br /><span className="giant-outline">Watch</span></h1>
          <p className="lede">
            A drone sees it first. AI names it in seconds. Authorities get the alert
            before swimmers ever see a fin. Scroll — and dive.
          </p>
          <div className="meta">
            <div><b>98.2%</b>Detection confidence</div>
            <div><b>4.1s</b>Drone → alert</div>
            <div><b>120m</b>Cruising altitude</div>
          </div>
          <button className="cta" onClick={() => setReportOpen(true)}>Report a sighting →</button>
          <Link href="/detect" className="cta secondary" style={{ textDecoration: "none" }}>Try detection →</Link>
          <button className="cta secondary" onClick={() => document.getElementById("live")?.scrollIntoView({ behavior: "smooth" })}>Watch live feed</button>
          <p style={{ marginTop: 22, opacity: 0.6, letterSpacing: ".25em", fontSize: 12 }}>SCROLL TO DIVE ↓ &nbsp; DEPTH {Math.round(depth * 100)}%</p>
        </div>
      </section>

      {/* 02 — LIVE DRONE FEED */}
      <section className="scene" id="live">
        <div className="scene-inner">
          <p className="eyebrow">02 — Drone feed • Simulated live view</p>
          <h2 className="giant" style={{ fontSize: "clamp(48px, 10vw, 160px)" }}>It sees<br />before you do.</h2>
          <div className="viewfinder" style={{ marginTop: 32 }}>
            <Image src="/sharks/great-white.webp" alt="Aerial drone view of a great white shark" width={1400} height={800} priority />
            <div className="hud"><span>● REC &nbsp; DRONE 07</span><span>ALT 120M • 32.7°N</span><span>{clock}</span></div>
            <div className="reticle"><i /><i /><i /><i /></div>
            <div className="scanline" />
            <div className="hud-bottom"><span>AI: GREAT WHITE — 98.2%</span><span>TRACKING • MOVING NW 4 KT</span></div>
          </div>
          <p className="lede">No cards, no clutter. Just the ocean, a reticle, and a name. When confidence passes 90%, the alert fires automatically.</p>
        </div>
      </section>

      {/* 03 — HOW IT WORKS, full-width, no cards */}
      <section className="scene">
        <div className="scene-inner">
          <p className="eyebrow">03 — How it works</p>
          <h2 className="giant" style={{ fontSize: "clamp(48px, 11vw, 180px)" }}>Drone.<br />Detect.<br />Alert.</h2>
          <div className="flow">
            <div><span>01</span><h3>Drone patrols</h3><p>Autonomous drones sweep beaches and surf breaks on a loop, streaming 4K top-down ocean video.</p></div>
            <div><span>02</span><h3>AI identifies</h3><p>On-device vision classifies species, size, speed and direction — and ignores dolphins, rays and shadows.</p></div>
            <div><span>03</span><h3>Authorities alerted</h3><p>Confirmed sightings go straight to lifeguards and local authorities with location, video clip and species.</p></div>
          </div>
        </div>
      </section>

      {/* 04 — GIGANTIC FLOATING SHARK TYPES */}
      {SPECIES.map((s, i) => (
        <section className="scene" key={s.name}>
          <div className="scene-inner">
            <p className="eyebrow">04.{i + 1} — Detected species • {s.risk} risk</p>
            <h2 className="giant">{s.name}</h2>
            <p style={{ fontStyle: "italic", opacity: 0.8, fontSize: 20, marginTop: 8 }}>{s.latin} — {s.length}</p>
            <div className="shark-float">
              <Image className="species-img" src={s.img} alt={`${s.name} in the ocean`} width={1400} height={800} />
            </div>
            <p className="lede">{s.note}</p>
            <button className="cta secondary" onClick={() => { setSpecies(s.name); setReportOpen(true); }}>Report a {s.name} →</button>
          </div>
        </section>
      ))}

      {/* 05 — DEEP OCEAN / REPORT CTA */}
      <section className="scene" id="report">
        <div className="scene-inner" style={{ textAlign: "center" }}>
          <p className="eyebrow" style={{ textAlign: "center" }}>05 — Deep water • You are here</p>
          <h2 className="giant">Seen<br />a fin?</h2>
          <p className="lede" style={{ margin: "24px auto 0" }}>
            Don&apos;t chase it, don&apos;t film it up close. Tap report, drop a pin, and let
            lifeguards and authorities take it from there. Thirty seconds can clear a beach.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="cta" onClick={() => setReportOpen(true)}>Report to authorities →</button>
            <Link href="/alerts" className="cta secondary" style={{ textDecoration: "none" }}>View live alerts →</Link>
            <Link href="/dashboard" className="cta secondary" style={{ textDecoration: "none" }}>Authority dashboard →</Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-.03em", color: "#fff" }}>SHARKWATCH</p>
        <p style={{ marginTop: 12 }}>Drone footage is illustrative in this demo. In production, reports are verified by AI + a human reviewer before broadcast.</p>
        <p style={{ marginTop: 8 }}>Built with Next.js + TypeScript • Scroll = camera dive • No cards were harmed.</p>
      </footer>

      {/* Full-screen report flow — not a card */}
      {reportOpen && (
        <div className="report" role="dialog" aria-label="Report a shark sighting">
          <button className="cta secondary" style={{ alignSelf: "flex-start", marginTop: 0 }} onClick={() => { setReportOpen(false); setSentRef(""); }}>← Back to ocean</button>
          {!sentRef ? (
            <>
              <p className="eyebrow">Report to authorities</p>
              <h2 className="giant" style={{ fontSize: "clamp(48px, 9vw, 140px)" }}>Report<br />a shark.</h2>
              <label>Species seen</label>
              <div className="species-pick">
                {["Great White", "Hammerhead", "Tiger", "Bull", "Mako", "Not sure"].map((n) => (
                  <button key={n} className={species === n ? "on" : ""} onClick={() => setSpecies(n)}>{n}</button>
                ))}
              </div>
              <label htmlFor="loc">Where? Beach, pin or landmark</label>
              <input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bondi Beach, north end" />
              <label htmlFor="notes">What did you see? (optional)</label>
              <textarea id="notes" rows={2} placeholder="Size, direction, how close to swimmers…" />
              <button className="cta" onClick={sendReport}>Send alert to authorities →</button>
              <p style={{ marginTop: 16, opacity: 0.6 }}>This demo generates a local reference only — connect your authority webhook in production.</p>
            </>
          ) : (
            <>
              <p className="eyebrow">Alert sent ✓</p>
              <h2 className="giant" style={{ fontSize: "clamp(48px, 9vw, 140px)" }}>Thank<br />you.</h2>
              <p className="lede">Your {species} sighting{location ? ` at ${location}` : ""} was logged for lifeguards and local authorities.</p>
              <p style={{ fontSize: 32, fontWeight: 900, marginTop: 28, letterSpacing: ".05em" }}>Reference: {sentRef}</p>
              <button className="cta" onClick={() => { setReportOpen(false); setSentRef(""); }}>Back to the ocean →</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
