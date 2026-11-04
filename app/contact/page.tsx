"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* Contact page, in the same light format as Why SharkWatch (2026-11-02):
 * light body, dark solid nav, Apple-style scroll reveal, Pexels stock
 * photos (not the homepage shark set, not patrol frames).
 * Interim contact route (2026-11-02, at Aziz's request): there is no
 * backend inbox yet, so the form opens the visitor's email client with
 * a message addressed to azizdemir6@gmail.com, the visitor presses
 * Send in their mail app to deliver it. Replace this with a real
 * backend form handler when a proper inbox is wired up. */
export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [beach, setBeach] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false); 
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
          <Link href="/contact" aria-current="page" style={{ color: "#90e0c8" }}>Contact</Link>
        </div>
      </nav>
      <main className="why-main">
        <div className="why-reveal">
          <h1>Bring SharkWatch<br /><em>to your beach.</em></h1>
          <p className="why-intro">For beaches, lifeguard teams and coastal authorities that want a pilot: tell us where you patrol and what you fly, and we will get back to you about running SharkWatch over your shoreline.</p>
        </div>
        <figure className="why-hero why-reveal">
          <img src="https://images.pexels.com/photos/4784200/pexels-photo-4784200.jpeg?auto=compress&cs=tinysrgb&w=1600" alt="Aerial view of a turquoise beach" loading="lazy" />
          <figcaption>Stock photo (Pexels), the shoreline a pilot would watch, not a SharkWatch patrol frame.</figcaption>
        </figure>
        <div className="why-grid why-reveal">
          <div className="why-card"><div className="why-label">Beaches &amp; lifeguards</div><p>Replay a recorded patrol first, then run Live over your own footage.</p></div>
          <div className="why-card"><div className="why-label">Coastal authorities</div><p>Alerts in CAP format, with acknowledgement and all-clear built in.</p></div>
          <div className="why-card"><div className="why-label">Drone teams</div><p>Works from ordinary drone footage, no special hardware required.</p></div>
        </div>
        <figure className="why-photo why-reveal">
          <img src="https://images.pexels.com/photos/4784189/pexels-photo-4784189.jpeg?auto=compress&cs=tinysrgb&w=1200" alt="People surfing on a beach" loading="lazy" />
          <figcaption>Stock photo (Pexels), the swimmers and surfers a pilot is watching over.</figcaption>
        </figure>
        <div className="why-reveal">
        {sent ? (
          <div className="why-sent">
            <b>Thanks{name ? `, ${name}` : ""}, your email client should have opened.</b>
            <p>Your message was addressed to azizdemir6@gmail.com. Press Send in your email app to deliver it, it is not sent until you do.</p>
            <button type="button" className="why-btn" onClick={() => setSent(false)}>Send another message</button>
          </div>
        ) : (
          <form className="why-form" onSubmit={(e) => { e.preventDefault(); const subject = `SharkWatch pilot, ${beach || "beach enquiry"}`; const body = `Name: ${name}\nEmail: ${email}\nBeach or organisation: ${beach}\n\n${message}`; window.location.href = `mailto:azizdemir6@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; setSent(true); }}>
            <label><span>Name</span><input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>
            <label><span>Email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@beach.example" /></label>
            <label><span>Beach or organisation</span><input type="text" value={beach} onChange={(e) => setBeach(e.target.value)} placeholder="Capistrano Beach, lifeguard team, council…" /></label>
            <label><span>Message</span><textarea rows={5} required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Where do you patrol, and what would you like to pilot?" /></label>
            <button type="submit" className="why-btn solid">Send message →</button>
          </form>
        )}
        </div>
      </main>
      <footer className="descent-footer">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}><Link href="/" style={{ flexShrink: 0, display: "block" }}><img src="/sharkwatch-logo.svg" alt="SharkWatch" width="180" style={{ display: "block", height: "auto" }} /></Link></div>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
          <div><div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Pages</div><div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}><Link href="/demo" style={{ color: "#9db4bc", textDecoration: "none" }}>Demo →</Link><Link href="/#how-it-works" style={{ color: "#9db4bc", textDecoration: "none" }}>How It Works →</Link><Link href="/why-sharkwatch" style={{ color: "#9db4bc", textDecoration: "none" }}>Why SharkWatch →</Link><Link href="/faq" style={{ color: "#9db4bc", textDecoration: "none" }}>FAQ →</Link><Link href="/map"  style={{ color: "#9db4bc", textDecoration: "none" }}>Map →</Link><Link href="/about" style={{ color: "#9db4bc", textDecoration: "none" }}>About →</Link><Link href="/contact" style={{ color: "#9db4bc", textDecoration: "none" }}>Contact →</Link></div></div>
          <div><div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Tech</div><div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}><span style={{ color: "#9db4bc" }}>Meta SAM 3.1</span><span style={{ color: "#9db4bc" }}>Meta Muse Spark 1.3</span><span style={{ color: "#9db4bc" }}>Next.js 14 + TypeScript</span><span style={{ color: "#9db4bc" }}>SSE</span></div></div>
          <div><div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Info</div><div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}><span style={{ color: "#9db4bc" }}>Node 22.12+</span><span style={{ color: "#9db4bc" }}>Replay: free, no keys</span><span style={{ color: "#9db4bc" }}>Live: ~$0.03–0.20/patrol</span><span style={{ color: "#9db4bc" }}>MIT License</span></div></div>
        </div>
        <div style={{ width: "100%", borderTop: "1px solid rgba(238,244,243,.18)", paddingTop: 16, marginTop: 8, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}><span className="descent-mono" style={{ color: "#9db4bc" }}>© 2026 SharkWatch</span></div>
      </footer>
    </div>
  );
}
