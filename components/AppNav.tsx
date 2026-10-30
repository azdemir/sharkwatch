import Link from "next/link";

export default function AppNav() {
  return (
    <header className="appnav">
      <Link href="/" className="appbrand">SHARKWATCH ◉</Link>
      <nav>
        <Link href="/detect">Detect</Link>
        <Link href="/report">Report</Link>
        <Link href="/alerts">Alerts</Link>
        <Link href="/dashboard">Authority dashboard</Link>
      </nav>
    </header>
  );
}
