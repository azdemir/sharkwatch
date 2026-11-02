import Link from "next/link";

// About page: only what the site already says elsewhere, the three-step
// pipeline from the homepage, the Replay/Live modes, and the tech list.
// No new beaches, sightings or partners are claimed here.
export default function About() {
  return (
    <div className="descent-page">
      <nav className="descent-nav">
        <Link href="/" style={{ flexShrink: 0, display: "block" }}><img src="/sharkwatch-logo.svg" alt="SharkWatch" width="200" style={{ display: "block", height: "auto" }} /></Link>
        <div className="descent-nav-links">
          <Link href="/#how-it-works">How It Works</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </nav>
      <main className="contact-main">
        <h1>About <em>SharkWatch.</em></h1>
        <p className="contact-intro">SharkWatch watches the water from a drone so a lifeguard does not have to watch every frame by eye. It understands footage, then alerts, it does not just record it.</p>
        <div className="contact-grid">
          <div><div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>1 · Seen</div><p>Meta SAM 3.1 traces sharks, and people in 6-second chunks, at 10 frames per second. A track must be seen in 8 frames before it counts.</p></div>
          <div><div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>2 · Named</div><p>Muse Spark verifies each traced contact, species, length, nearest person, and screens out dolphins, seals, rays and kelp before anyone is alerted.</p></div>
          <div><div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>3 · Acted on</div><p>A confirmed shark becomes one alert per patrol, sent to lifeguards on Telegram with the evidence photo, in CAP format, with acknowledgement and all-clear built in. A critical alert nobody acknowledges escalates after 45 seconds.</p></div>
        </div>
        <div className="contact-grid" style={{ marginTop: 32 }}>
          <div><div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>Replay, free, no key</div><p>A recorded run of the real pipeline at real-time speed. No new API calls, no cost, and the agencies in it are simulated, no real agency is contacted in Replay.</p></div>
          <div><div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>Live, SAM 3.1 + Muse Spark</div><p>Runs the models on footage as it plays, about $0.03–0.20 per patrol. Live needs a Meta key and is local-dev only.</p></div>
          <div><div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>Tech</div><p>Meta SAM 3.1 · Meta Muse Spark 1.3 · Next.js 14 + TypeScript · Fastify + SSE.</p></div>
        </div>
        <p style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/demo" className="descent-btn solid" style={{ textDecoration: "none", display: "inline-block" }}>Try the Demo →</Link>
          <Link href="/map" className="descent-btn" style={{ textDecoration: "none", display: "inline-block" }}>Patrol map →</Link>
          <Link href="/contact" className="descent-btn" style={{ textDecoration: "none", display: "inline-block" }}>Contact →</Link>
        </p>
      </main>
      <footer className="descent-footer">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}><Link href="/" style={{ flexShrink: 0, display: "block" }}><img src="/sharkwatch-logo.svg" alt="SharkWatch" width="180" style={{ display: "block", height: "auto" }} /></Link></div>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
          <div><div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Pages</div><div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}><Link href="/demo" style={{ color: "#9db4bc", textDecoration: "none" }}>Demo →</Link><Link href="/#how-it-works" style={{ color: "#9db4bc", textDecoration: "none" }}>How It Works →</Link><Link href="/map" style={{ color: "#9db4bc", textDecoration: "none" }}>Map →</Link><Link href="/about" style={{ color: "#9db4bc", textDecoration: "none" }}>About →</Link><Link href="/contact" style={{ color: "#9db4bc", textDecoration: "none" }}>Contact →</Link></div></div>
        </div>
        <div style={{ width: "100%", borderTop: "1px solid rgba(238,244,243,.18)", paddingTop: 16, marginTop: 8 }}><span className="descent-mono" style={{ color: "#9db4bc" }}>© 2026 SharkWatch</span></div>
      </footer>
    </div>
  );
}
