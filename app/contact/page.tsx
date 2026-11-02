"use client";

import { useState } from "react";
import Link from "next/link";

/* Contact page. The form is front-end only for now: on submit it shows a
 * confirmation in the page, but nothing is sent to an inbox yet. Wire it to
 * a real inbox (or a Telegram bot) before presenting it as a live contact
 * channel — see the note in the chat delivery, not on the page. */

export default function Contact() {
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="descent-page">
      <nav className="descent-nav">
        <Link href="/" style={{ flexShrink: 0, display: "block" }}>
          <img src="/sharkwatch-logo.svg" alt="SharkWatch" width="200" style={{ display: "block", height: "auto" }} />
        </Link>
        <div className="descent-nav-links">
          <Link href="/contact" aria-current="page" style={{ color: "#90e0c8" }}>Contact</Link>
        </div>
      </nav>

      <main className="contact-main">
        <h1>
          Bring SharkWatch<br />
          <em>to your beach.</em>
        </h1>
        <p className="contact-intro">
          For beaches, lifeguard teams and coastal authorities that want a pilot:
          tell us where you patrol and what you fly, and we will get back to you
          about running SharkWatch over your shoreline.
        </p>

        <div className="contact-grid">
          <div>
            <div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>Beaches &amp; lifeguards</div>
            <p>Replay a recorded patrol first, then run Live over your own footage.</p>
          </div>
          <div>
            <div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>Coastal authorities</div>
            <p>Alerts in CAP format, with acknowledgement and all-clear built in.</p>
          </div>
          <div>
            <div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 6, fontSize: 11 }}>Drone teams</div>
            <p>Works from ordinary drone footage — no special hardware required.</p>
          </div>
        </div>

        {sent ? (
          <div className="contact-sent">
            <b>Thanks{name ? `, ${name}` : ""} — message received.</b>
            <p>We will get back to you about a pilot for your beach.</p>
            <button type="button" className="descent-btn" onClick={() => setSent(false)}>
              Send another message
            </button>
          </div>
        ) : (
          <form
            className="contact-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
          >
            <label>
              <span>Name</span>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </label>
            <label>
              <span>Email</span>
              <input type="email" required placeholder="you@beach.example" />
            </label>
            <label>
              <span>Beach or organisation</span>
              <input type="text" placeholder="Capistrano Beach, lifeguard team, council…" />
            </label>
            <label>
              <span>Message</span>
              <textarea rows={5} required placeholder="Where do you patrol, and what would you like to pilot?" />
            </label>
            <button type="submit" className="descent-btn solid">
              Send message →
            </button>
          </form>
        )}
      </main>

      <footer className="descent-footer">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          <img src="/sharkwatch-logo.svg" alt="SharkWatch" width="180" style={{ flexShrink: 0, display: "block", height: "auto" }} />
        </div>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
          <div>
            <div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Pages</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <Link href="/demo" style={{ color: "#9db4bc", textDecoration: "none" }}>Demo →</Link>
              <Link href="/contact" style={{ color: "#9db4bc", textDecoration: "none" }}>Contact →</Link>
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
