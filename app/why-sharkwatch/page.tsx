"use client";

import { useEffect } from "react";
import Link from "next/link";

// Why SharkWatch, LIGHT, Apple-style scroll reveal, NEW pictures.
// Pictures are Pexels stock photos (beach / surfers / lifeguard views),
// NOT the homepage's hero-aerial / great-white / hammerhead / tiger set,
// and NOT SharkWatch patrol frames, captions say so, so they are never
// presented as detections. Numbers are ISAF (Florida Museum), see Sources.
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
          <p className="why-intro">From the sand, the water looks calm. What is below the surface is not visible to a swimmer, and often not visible to a lifeguard watching from shore. SharkWatch exists for that gap between a shark being in the water and anyone knowing it is there.</p>
        </div>
        <figure className="why-hero why-reveal">
          <img src="https://images.pexels.com/photos/3556117/pexels-photo-3556117.jpeg?auto=compress&cs=tinysrgb&w=1600" alt="Beach and ocean seen from a drone" loading="lazy" />
          <figcaption>Stock photo (Pexels), a beach from above, not a SharkWatch patrol frame.</figcaption>
        </figure>
        <section className="why-reveal">
          <h2>The numbers, first, honestly</h2>
          <p>Shark bites are rare. That is the first thing the data says, and this page does not pretend otherwise. The International Shark Attack File (ISAF), kept by the Florida Museum of Natural History, counts an “unprovoked” bite as one that happens in the shark’s natural habitat with no human provocation, no spearfishing, feeding, or trying to free a shark from a net. On that definition:</p>
          <div className="why-grid">
            <div className="why-card"><div className="why-label">Worldwide · 2025</div><p className="why-big">65 <span>unprovoked bites</span></p><p>9 of them fatal. 12 people died in shark incidents in total that year, including provoked cases.</p></div>
            <div className="why-card"><div className="why-label">United States · 2025</div><p className="why-big">25 <span>unprovoked bites</span></p><p>38% of the world total, with 1 fatality. Florida alone had 11, 44% of the US total, 17% of the world total.</p></div>
            <div className="why-card"><div className="why-label">Worldwide · 2024</div><p className="why-big">47 <span>unprovoked bites</span></p><p>4 of them fatal, a low year. The US had 28 bites that year, 14 of them in Florida, 8 in Volusia County alone.</p></div>
            <div className="why-card"><div className="why-label">5-year average · 2020–2024</div><p className="why-big">61 <span>bites a year</span></p><p>About 8 unprovoked fatalities a year on average. Year to year, the numbers swing a lot, 2024 was low, 2025 bounced back, which is normal, not a steady climb.</p></div>
            <div className="why-card"><div className="why-label">The odds</div><p className="why-big">1 in 4,332,817</p><p>ISAF’s figure for a fatal shark encounter, using National Safety Council and CDC comparisons. For any one swimmer, the risk is extremely low, far below drowning, which ISAF notes is a much larger beach risk.</p></div>
            <div className="why-card"><div className="why-label">Who gets bitten</div><p className="why-big">Surfers · ⅓</p><p>Surfers made up about a third of unprovoked bites in 2024. Murky, wave-churned water that draws bait fish and cuts visibility is a recurring factor, the shark often cannot tell a person from its usual prey.</p></div>
          </div>
          <p>So why build anything at all, if the risk is that low? Because “rare” is not the same as “harmless.” Each fatality is a life, each non-fatal bite can be a serious injury, and each incident closes a beach, shakes a community, and leaves the same question behind: was anyone watching that stretch of water, and did they know in time?</p>
        </section>
        <figure className="why-photo why-reveal">
          <img src="https://images.pexels.com/photos/5232440/pexels-photo-5232440.jpeg?auto=compress&cs=tinysrgb&w=1200" alt="Surfers on a beach" loading="lazy" />
          <figcaption>Stock photo (Pexels), the people most exposed are the ones already in the water.</figcaption>
        </figure>
        <section className="why-reveal">
          <h2>The real problem is not the number. It is the warning time.</h2>
          <div className="why-grid">
            <div className="why-card"><div className="why-label">You cannot see it from shore</div><p>A shark a few metres below the surface, in murky water or at dawn and dusk, is invisible to a swimmer and hard to spot from a tower. Sightings happen far more often than bites, but a sighting only helps if someone sees it, believes it, and acts on it.</p></div>
            <div className="why-card"><div className="why-label">A human eye cannot watch every frame</div><p>Drone patrols already fly, but a pilot watching a live feed has to notice a shape, judge what it is, and pass the message on, while flying. Attention, fatigue, and coverage gaps before and after lifeguard hours all cut into that chain.</p></div>
            <div className="why-card"><div className="why-label">The message chain is slow</div><p>Today a sighting typically travels person to person, pilot to park staff to lifeguard to beach closure, with each step adding minutes. In that time, swimmers are still in the water, and the shark may have moved on or come closer.</p></div>
            <div className="why-card"><div className="why-label">Not every shape is a shark</div><p>Dolphins, seals, rays, kelp, and shadows all look like sharks from above. Alert on every shape and beaches close for nothing; ignore shapes and the real one is missed. The hard part is not seeing something, it is knowing what it is.</p></div>
            <div className="why-card"><div className="why-label">More people, same water</div><p>Beach use, surfing, and open-water swimming keep growing, and sharks and bait fish still come close to shore. More overlap means more chances for the rare encounter to happen on a busy day, in front of a crowd.</p></div>
            <div className="why-card"><div className="why-label">Awareness, not fear</div><p>Most beachgoers have no real-time picture of what is in the water near them. Better awareness, clear, verified, and calm, lets people and lifeguards make better decisions than either panic or ignorance does.</p></div>
          </div>
        </section>
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
          <p>International Shark Attack File (ISAF), Florida Museum of Natural History, annual summaries for 2024 and 2025, including the 2020–2024 five-year averages and the fatality-odds comparison drawn from National Safety Council and CDC data. Figures are for unprovoked bites unless stated otherwise; provoked bites (spearfishing, feeding, freeing a shark) are counted separately by ISAF. If ISAF revises a year, these numbers should be updated to match. Photos on this page are Pexels stock photos, not SharkWatch patrol footage.</p>
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
