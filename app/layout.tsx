import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SHARKWATCH — Drone Shark Detection & Authority Alerts",
  description:
    "AI drone footage detects sharks in real time and reports sightings to authorities. Cinematic, full-screen, no clutter.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
