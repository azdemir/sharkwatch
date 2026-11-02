import type { Metadata } from "next";
import "./globals.css";

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://sharkwatch.vercel.app"),
  title: {
    default: "SharkWatch",
    template: "%s | SharkWatch",
  },
  description:
    "Drone shark detection and authority alerts. Meta SAM 3.1 finds sharks in drone footage, Muse Spark verifies them, and confirmed alerts reach lifeguards in seconds.",
  keywords: [
    "shark detection",
    "drone shark detection",
    "Meta SAM 3.1",
    "Muse Spark",
    "lifeguard alerts",
    "beach safety",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SharkWatch",
    description:
      "Drone shark detection and authority alerts. Meta SAM 3.1 finds sharks in drone footage, Muse Spark verifies them, and confirmed alerts reach lifeguards in seconds.",
    url: "https://sharkwatch.vercel.app",
    siteName: "SharkWatch",
    type: "website",
    images: [
      {
        url: "/descent/hero-aerial.jpg",
        alt: "Aerial drone view of a shark near a beach",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SharkWatch",
    description:
      "Drone shark detection and authority alerts. Meta SAM 3.1 finds sharks in drone footage, Muse Spark verifies them, and confirmed alerts reach lifeguards in seconds.",
    images: ["/descent/hero-aerial.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SharkWatch",
  url: "https://sharkwatch.vercel.app",
  description:
    "Drone shark detection and authority alerts. Meta SAM 3.1 finds sharks in drone footage, Muse Spark verifies them, and confirmed alerts reach lifeguards in seconds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
