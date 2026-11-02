import type { Metadata } from "next";
import "./demo.css";

export const metadata: Metadata = {
  title: "Demo",
  description:
    "Try SharkWatch: replay recorded drone patrols with shark detection, timeline, map, and lifeguard alerts — or run Live detection on new footage.",
  alternates: { canonical: "/demo" },
  openGraph: {
    title: "Demo | SharkWatch",
    description:
      "Try SharkWatch: replay recorded drone patrols with shark detection, timeline, map, and lifeguard alerts — or run Live detection on new footage.",
    url: "https://sharkwatch.vercel.app/demo",
  },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
