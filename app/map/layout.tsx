import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patrol Map",
  description:
    "SharkWatch patrol map: drone patrol areas, coast framing, and distance to shore for shark detections.",
  alternates: { canonical: "/map" },
  openGraph: {
    title: "Patrol Map | SharkWatch",
    description:
      "SharkWatch patrol map: drone patrol areas, coast framing, and distance to shore for shark detections.",
    url: "https://sharkwatch.vercel.app/map",
  },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
