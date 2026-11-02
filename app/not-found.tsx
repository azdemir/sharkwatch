import Link from "next/link";

export default function NotFound() {
  return (
    <div className="descent-page" style={{ minHeight: "100svh", display: "flex", flexDirection: "column" }}>
      <nav className="descent-nav">
        <Link href="/" style={{ flexShrink: 0, display: "block" }}><img src="/sharkwatch-logo.svg" alt="SharkWatch" width="200" style={{ display: "block", height: "auto" }} /></Link>
        <div className="descent-nav-links">
          <Link href="/#how-it-works">How It Works</Link>
          <Link href="/why-sharkwatch">Why SharkWatch</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </nav>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "140px 32px 80px" }}>
        <div className="descent-mono" style={{ color: "#90e0c8", marginBottom: 16, fontSize: 12 }}>404 — Nothing here</div>
        <h1 style={{ fontSize: "clamp(48px, 8vw, 96px)", lineHeight: 0.95, margin: "0 0 20px", fontWeight: 850, textTransform: "uppercase" }}>
          Lost at <em style={{ fontFamily: "Palatino, Georgia, serif", fontStyle: "italic", fontWeight: 400, textTransform: "none", color: "#90e0c8" }}>sea?</em>
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: "#c4d6db", maxWidth: 480, margin: "0 0 28px" }}>
          This page does not exist — it may have moved, or the link may be
          out of date. The How It Works section now lives on the homepage.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/" className="descent-btn solid" style={{ textDecoration: "none", display: "inline-block", padding: "12px 20px", fontSize: 12 }}>Back to the homepage →</Link>
          <Link href="/#how-it-works" className="descent-btn" style={{ textDecoration: "none", display: "inline-block", padding: "12px 20px", fontSize: 12 }}>How It Works</Link>
          <Link href="/demo" className="descent-btn" style={{ textDecoration: "none", display: "inline-block", padding: "12px 20px", fontSize: 12 }}>Try the Demo</Link>
        </div>
      </main>
      <footer className="descent-footer">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          <Link href="/" style={{ flexShrink: 0, display: "block" }}><img src="/sharkwatch-logo.svg" alt="SharkWatch" width="180" style={{ display: "block", height: "auto" }} /></Link>
        </div>
        <div>
          <div className="descent-mono" style={{ marginBottom: 10, color: "#fff" }}>Pages</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <Link href="/demo" style={{ color: "#9db4bc", textDecoration: "none" }}>Demo →</Link>
            <Link href="/#how-it-works" style={{ color: "#9db4bc", textDecoration: "none" }}>How It Works →</Link>
            <Link href="/why-sharkwatch" style={{ color: "#9db4bc", textDecoration: "none" }}>Why SharkWatch →</Link>
            <Link href="/faq" style={{ color: "#9db4bc", textDecoration: "none" }}>FAQ →</Link>
            <Link href="/contact" style={{ color: "#9db4bc", textDecoration: "none" }}>Contact →</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
