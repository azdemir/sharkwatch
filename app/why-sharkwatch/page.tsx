"use client";

import { useEffect } from "react";
import Link from "next/link";

// Why SharkWatch, LIGHT, Apple-style scroll reveal, NEW pictures.
// Pictures are Pexels stock photos (beach / surfers / lifeguard views),
// NOT the homepage's hero-aerial / great-white / hammerhead / tiger set,
// and NOT SharkWatch patrol frames, captions say so, so they are never
// presented as detections. Ocean-use numbers are Houston/ASBPA, NOAA,
// IUCN and a 2024 coastal-population study, see Sources; the one
// bite figure is ISAF (Florida Museum), see Sources.
export default function WhySharkWatch() {
  useEffect(() => {
    const els = document.querySelectorAll(".why-reveal");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    const t = setTimeout(() => els.forEach((el) => el.classList.add("in")), 1500);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return (
    <div className="why-light">
      <nav className="descent-nav why-nav">
        <Link href="/" style={{ flexShrink: 0, display: "block" }}><img src="/sharkwatch-logo.svg" alt="SharkWatch" width="180" style={{ display: "block", height: "auto" }} /></Link>
        <div className="descent-nav-links">
          <Link href="/#how-it-works">How It Works</Link>
          <Link href="/why-sharkwatch">Why SharkWatch</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </nav>
      <main className="why-main">
        <div className="why-reveal">
          <h1>Why <em>SharkWatch.</em></h1>
          <p className="why-intro">From the sand, the water looks calm, and millions of people enjoy it every year. SharkWatch exists to give lifeguards a clear, verified picture of what is below the surface, so the people already in the water can be looked after with confidence.</p>
        </div>
        <figure className="why-hero why-reveal">
          <img src="https://images.pexels.com/photos/3556117/pexels-photo-3556117.jpeg?auto=compress&cs=tinysrgb&w=1600" alt="Beach and ocean seen from a drone" loading="lazy" />
          <figcaption>Stock photo (Pexels), a beach from above, not a SharkWatch patrol frame.</figcaption>
        </figure>
        <section className="why-reveal">
          <h2>How many people are actually in the water</h2>
          <p>Start with the scale, not the scare. Millions of people swim, surf, paddle, and play at the beach every year, in the United States and around the world. That is a lot of people sharing the same water, on the same busy days:</p>
          <div className="why-grid">
            <div className="why-card"><div className="why-label">United States · each year</div><p className="why-big">180 <span>million beach visitors</span></p><p>About 180 million people visit US beaches each year, according to coastal researcher James R. Houston and the American Shore and Beach Preservation Association.</p></div>
            <div className="why-card"><div className="why-label">United States · visits</div><p className="why-big">3.4 <span>billion beach visits a year</span></p><p>Those visitors make about 3.4 billion beach visits a year in total, far more than all US national parks combined.</p></div>
            <div className="why-card"><div className="why-label">United States · how common</div><p className="why-big">47% <span>of Americans visit a beach each year</span></p><p>Nearly half of Americans visit a beach in a year, and 15% go monthly, in Houston’s surveys of beachgoing.</p></div>
            <div className="why-card"><div className="why-label">United States · days on the coast · 2012</div><p className="why-big">1.2 <span>billion coastal recreation days</span></p><p>In NOAA’s National Ocean Recreation Expenditure Survey, more than 48 million American adults spent about 1.2 billion days along the coast in 2012.</p></div>
            <div className="why-card"><div className="why-label">World · Mediterranean · 2024</div><p className="why-big">360 <span>million visitors</span></p><p>The Mediterranean region welcomed nearly 360 million visitors in 2024, according to the IUCN’s 2025 Sustainable Blue Tourism report.</p></div>
            <div className="why-card"><div className="why-label">World · living close to the coast</div><p className="why-big">2 <span>billion+ people within 50 km of a shoreline</span></p><p>A 2024 study found more than 2 billion people lived within 50 km of a shoreline in 2018, over 29% of the world’s population at the time.</p></div>
          </div>
          <p>That is why a clear picture of the water matters, even though shark bites themselves are rare: the International Shark Attack File counted 65 unprovoked bites worldwide in 2025. With this many people in the water, the job is to watch a busy stretch clearly, and to give lifeguards a verified answer in seconds, not a guess.</p>
        </section>
        <figure className="why-photo why-reveal">
          <img src="https://images.pexels.com/photos/5232440/pexels-photo-5232440.jpeg?auto=compress&cs=tinysrgb&w=1200" alt="Surfers on a beach" loading="lazy" />
          <figcaption>Stock photo (Pexels), surfers enjoying the water.</figcaption>
        </figure>
        <div className="why-photos why-reveal">
          <figure className="why-photo"><img src="https://images.pexels.com/photos/2060301/pexels-photo-2060301.jpeg?auto=compress&cs=tinysrgb&w=1200" alt="Beach and lifeguard view" loading="lazy" /><figcaption>Stock photo (Pexels), the view a lifeguard actually has.</figcaption></figure>
          <figure className="why-photo"><img src="https://images.pexels.com/photos/20470023/pexels-photo-20470023/free-photo-of-drone-shot-of-beach-along-ocean.jpeg?auto=compress&cs=tinysrgb&w=1200" alt="Drone shot of a beach along the ocean" loading="lazy" /><figcaption>Stock photo (Pexels), the view a drone adds.</figcaption></figure>
        </div>
        <section className="why-reveal">
          <h2>How SharkWatch answers that</h2>
          <p>SharkWatch does not try to make the ocean safe. It tries to close the warning gap, in seconds, with evidence a lifeguard can act on:</p>
          <div className="why-grid">
            <div className="why-card"><div className="why-label">1 · Seen</div><p>Meta SAM 3.1 traces sharks, and people, in drone footage, in 6-second chunks at 10 frames per second. A track must be seen in 8 frames before it counts, so a single glint does not become an alert.</p></div>
            <div className="why-card"><div className="why-label">2 · Named</div><p>Muse Spark verifies each traced contact, species, length, nearest person, and screens out dolphins, seals, rays, and kelp before anyone is alerted. If it cannot be verified, it is not presented as a shark.</p></div>
            <div className="why-card"><div className="why-label">3 · Acted on</div><p>A confirmed shark becomes one alert per patrol, sent to lifeguards on Telegram with the evidence photo, in CAP format, with acknowledgement and an all-clear built in. A critical alert nobody acknowledges escalates after 45 seconds, it does not just sit there.</p></div>
          </div>
          <p>The point is not more alerts. It is fewer, better ones: verified, with a photo, a location, and a risk level, so a lifeguard can decide, clear the water, watch that stretch, or stand down, instead of guessing from a shouted sighting. And because the demo’s Replay mode replays a recorded run at no cost, a beach can see exactly how that decision would play out before trusting it with a real patrol.</p>
          <p>SharkWatch is a detection aid, not a replacement for lifeguards, flags, patrols, or common sense, swim in patrolled zones during lifeguard hours, stay with other people, and avoid dawn and dusk. It is meant to give the people already responsible for beach safety a faster, clearer picture of what is below the surface.</p>
        </section>
        <section className="why-reveal">
          <h2>Sources</h2>
          <p>United States: James R. Houston and the American Shore and Beach Preservation Association, about 180 million beach visitors, about 3.4 billion beach visits a year, 47% of Americans visiting a beach each year; NOAA National Ocean Recreation Expenditure Survey, more than 48 million adults and about 1.2 billion coastal recreation days in 2012. World: IUCN, Sustainable Blue Tourism in the Mediterranean (2025), nearly 360 million visitors in 2024; a 2024 coastal-population study, more than 2 billion people within 50 km of a shoreline in 2018. There is no single official global beach-visitor count, so this page does not invent one. The one bite figure is the International Shark Attack File (ISAF), Florida Museum of Natural History, 65 unprovoked bites worldwide in 2025. Photos on this page are Pexels stock photos, not SharkWatch patrol footage.</p>
        </section>
        <p className="why-cta why-reveal">
          <Link href="/demo" className="why-btn solid">Try the Demo →</Link>
          <Link href="/#how-it-works" className="why-btn">How It Works →</Link>
          <Link href="/contact" className="why-btn">Contact →</Link>
        </p>
      </main>
      <footer className="descent-footer">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}><Link href="/" style={{ flexShrink: 0, display: "block" }}><img src="/sharkwatch-logo.svg" alt="SharkWatch" width="180" style={{ display: "block", height: "auto" }} /></Link></div>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
          <div><div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Pages</div><div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}><Link href="/demo" style={{ color: "#9db4bc", textDecoration: "none" }}>Demo →</Link><Link href="/#how-it-works" style={{ color: "#9db4bc", textDecoration: "none" }}>How It Works →</Link><Link href="/why-sharkwatch" style={{ color: "#9db4bc", textDecoration: "none" }}>Why SharkWatch →</Link><Link href="/faq" style={{ color: "#9db4bc", textDecoration: "none" }}>FAQ →</Link><Link href="/map"  style={{ color: "#9db4bc", textDecoration: "none" }}>Map →</Link><Link href="/about" style={{ color: "#9db4bc", textDecoration: "none" }}>About →</Link><Link href="/contact" style={{ color: "#9db4bc", textDecoration: "none" }}>Contact →</Link></div></div>
        </div>
        <div style={{ width: "100%", borderTop: "1px solid rgba(238,244,243,.18)", paddingTop: 16, marginTop: 8 }}><span className="descent-mono" style={{ color: "#9db4bc" }}>© 2026 SharkWatch</span></div>
      </footer>
    </div>
  );
}
