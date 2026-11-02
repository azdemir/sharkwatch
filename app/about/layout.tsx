import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "About SharkWatch: drone shark detection with Meta SAM 3.1 and Muse Spark, built to give lifeguards confirmed sightings in seconds.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About | SharkWatch",
    description:
      "About SharkWatch: drone shark detection with Meta SAM 3.1 and Muse Spark, built to give lifeguards confirmed sightings in seconds.",
    url: "https://sharkwatch.vercel.app/about",
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
