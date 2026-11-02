"use client";

import { useEffect } from "react";
import Link from "next/link";

// FAQ — same light format as Why SharkWatch and Contact (2026-11-02):
// light body, dark solid nav, Apple-style scroll reveal, Pexels stock
// photos (not the homepage shark set, not patrol frames).
// Answers describe what SharkWatch does TODAY. Where something is not
// settled — a price, a specific drone model, a guaranteed accuracy —
// the answer says so instead of inventing it.
export default function Faq() {
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
          <Link href="/faq" aria-current="page" style={{ color: "#90e0c8" }}>FAQ</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </nav>
      <main className="why-main">
        <div className="why-reveal">
          <h1>Frequently <em>asked questions.</em></h1>
          <p className="why-intro">Short, honest answers about SharkWatch — how it works, what drone you need, what it costs, and what it cannot do. If your question is not here, ask on the Contact page.</p>
        </div>
        <figure className="why-hero why-reveal">
          <img src="https://images.pexels.com/photos/16135846/pexels-photo-16135846.jpeg?auto=compress&cs=tinysrgb&w=1600" alt="Lifeguard sitting in a lifeguard stand looking out to sea" loading="lazy" />
          <figcaption>Stock photo (Pexels) — the person SharkWatch is built to help, not a SharkWatch patrol frame.</figcaption>
        </figure>
        <div className="why-faq why-reveal">
          <details open><summary>What is SharkWatch, in one sentence?</summary><p>SharkWatch watches drone footage of the water, understands what is in it with Meta SAM 3.1 and Muse Spark, and alerts lifeguards in seconds when a shark is verified — it does not just record video.</p></details>
          <details><summary>How does it work?</summary><p>In three steps: Seen — SAM 3.1 traces sharks and people in 6-second chunks at 10 frames per second, and a track must be seen in 8 frames before it counts. Named — Muse Spark verifies the contact (species, length, nearest person) and screens out dolphins, seals, rays and kelp. Acted on — a confirmed shark becomes one alert per patrol, sent to lifeguards on Telegram with an evidence photo, in CAP format, with acknowledgement and an all-clear.</p></details>
          <details><summary>Is SharkWatch installed on the drone?</summary><p>No — not in the current version. Nothing is installed on the drone itself and no drone firmware is changed. The drone flies and records or streams ordinary video, and SharkWatch runs on the ground — on the server or laptop processing that footage. That is why it works from footage you already have, as well as from a live patrol.</p></details>
          <details><summary>What drone should I use?</summary><p>SharkWatch does not endorse one specific model, and this page does not list a “compatible drones” table, because no such tested list exists yet. What matters is the footage, not the badge: a stable, gimbal-mounted aerial camera, at least 720p video (the demo clips are 1280×720), a recording in a standard format like mp4, or a live feed you can feed into the system. Flight time, range and wind handling decide how much shoreline one drone can cover — check those against your beach, and check your local drone rules and pilot requirements before flying.</p></details>
          <details><summary>Can I use my existing drone and footage?</summary><p>Yes. In the demo you can upload a video file, paste a direct video link, or paste a YouTube link (downloaded on the local server with yt-dlp). Recorded footage works the same way as a live patrol for testing — run it, watch the boxes and the alert, and judge the system before any real patrol.</p></details>
          <details><summary>How much does it cost?</summary><p>There are three separate costs, and only the middle one is a SharkWatch number. Replay in the demo costs $0 — it replays a recorded run and makes no new API calls. Live detection in the demo costs about $0.03–$0.20 per patrol in Meta API usage, depending on the clip. The drone itself is separate, is not sold by SharkWatch, and its price depends entirely on the model you choose — so this page does not quote a drone price. There is no subscription price announced yet; for a pilot, use the Contact page.</p></details>
          <details><summary>How fast is an alert?</summary><p>Seconds, not minutes. On the homepage timeline, a shark is seen at 0.0 s, named at about 2 s, and acted on at about 5 s. In a real patrol the exact time depends on the footage and the connection, but the design is the same: a track is confirmed, verified, then alerted — with an evidence photo — rather than passed person to person. A critical alert nobody acknowledges escalates after 45 seconds.</p></details>
          <details><summary>How accurate is it?</summary><p>No accuracy percentage is claimed here, because none has been published for this system. What is built in is verification, not blind trust: a track must persist for 8 frames, Muse Spark must verify it and screen out dolphins, seals, rays and kelp, and if a contact cannot be verified it is not presented as a shark. Length estimates in particular are approximate — a shark seen from above, at an angle, in moving water, does not give a tape-measure length.</p></details>
          <details><summary>Does it replace lifeguards?</summary><p>No. SharkWatch is a detection aid for the people already responsible for beach safety. It does not close a beach, rescue anyone, or replace flags, patrols, towers, or a lifeguard’s judgement. It gives those people a faster, clearer picture of what is below the surface, with evidence, so their decision is better informed.</p></details>
          <details><summary>Does it work at night, in murky water, or in bad weather?</summary><p>Only as well as the camera can see. SharkWatch needs a clear aerial view of the water. Murky water, dawn and dusk light, glare, rain and rough seas all reduce visibility — that is true for a human pilot too, and it is one reason the system verifies before alerting instead of alerting on every shape. It is not guaranteed to work in conditions where the shark cannot be seen in the footage.</p></details>
          <details><summary>What happens when a shark is found?</summary><p>One alert per patrol — not one per shark, and not one per frame. The alert goes to lifeguards on Telegram with the evidence photo, the risk level, and the location, in CAP format. Lifeguards acknowledge it, and when the area is clear an all-clear is sent. If a critical alert is not acknowledged in 45 seconds, it escalates. In the demo’s Replay mode the agencies are simulated — no real agency is contacted.</p></details>
          <details><summary>Can I try it without a drone?</summary><p>Yes. Open the Demo and run a Replay patrol — it is free, needs no key, and shows the full pipeline at real-time speed on recorded footage. You can also upload your own video and run Live detection on it, if a Meta key is configured on the local server.</p></details>
          <details><summary>Where does my footage go?</summary><p>In the current version, uploads are local-dev only: a file or downloaded link is stored under data/uploads/ on the machine running the server, and Live detection is not a Vercel feature. Do not treat an upload as a public, cloud-hosted service until a hosted version is announced.</p></details>
          <details><summary>What do I need to run Live detection myself?</summary><p>A Meta key in the project’s .env file (MODEL_API_KEY, or META_KEY — both are accepted), then a restart of the dev server, plus the project’s dependencies installed with npm install. YouTube links additionally need yt-dlp installed on that machine (brew install yt-dlp). Without a key, Live is unavailable and the demo falls back to Replay.</p></details>
          <details><summary>Is it available at my beach / in my country?</summary><p>Not as a general service yet. SharkWatch is currently a demo and a pilot project — there is no published list of covered beaches or countries. If you patrol a beach and want to pilot it there, use the Contact page and say where you patrol and what you fly.</p></details>
          <details><summary>Does SharkWatch guarantee I will not be bitten?</summary><p>No, and no honest system could. The risk of a shark bite is already extremely low, but it is not zero, and no camera, model or alert removes it. Swim in patrolled zones during lifeguard hours, stay with other people, and avoid dawn and dusk. SharkWatch aims to shorten the warning time — it does not make the ocean safe.</p></details>
        </div>
        <figure className="why-photo why-reveal">
          <img src="https://images.pexels.com/videos/10277987/dji-mavic-drone-mavic-pro-sea-10277987.jpeg?auto=compress&cs=tinysrgb&w=1200" alt="Drone flying over the sea" loading="lazy" />
          <figcaption>Stock photo (Pexels) — the drone is the camera; SharkWatch is the software that reads what it sees.</figcaption>
        </figure>
        <p className="why-cta why-reveal">
          <Link href="/demo" className="why-btn solid">Try the Demo →</Link>
          <Link href="/contact" className="why-btn">Contact →</Link>
        </p>
      </main>
      <footer className="descent-footer">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}><img src="/sharkwatch-logo.svg" alt="SharkWatch" width="180" style={{ flexShrink: 0, display: "block", height: "auto" }} /></div>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
          <div><div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Pages</div><div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}><Link href="/demo" style={{ color: "#9db4bc", textDecoration: "none" }}>Demo →</Link><Link href="/#how-it-works" style={{ color: "#9db4bc", textDecoration: "none" }}>How It Works →</Link><Link href="/why-sharkwatch" style={{ color: "#9db4bc", textDecoration: "none" }}>Why SharkWatch →</Link><Link href="/faq" style={{ color: "#9db4bc", textDecoration: "none" }}>FAQ →</Link><Link href="/map" style={{ color: "#9db4bc", textDecoration: "none" }}>Map →</Link><Link href="/about" style={{ color: "#9db4bc", textDecoration: "none" }}>About →</Link><Link href="/contact" style={{ color: "#9db4bc", textDecoration: "none" }}>Contact →</Link></div></div>
        </div>
        <div style={{ width: "100%", borderTop: "1px solid rgba(238,244,243,.18)", paddingTop: 16, marginTop: 8 }}><span className="descent-mono" style={{ color: "#9db4bc" }}>© 2026 SharkWatch</span></div>
      </footer>
    </div>
  );
}
