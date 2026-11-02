import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "How SharkWatch installs to a drone, what drone it needs, how much it costs, and its limits — answered honestly.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ | SharkWatch",
    description:
      "How SharkWatch installs to a drone, what drone it needs, how much it costs, and its limits — answered honestly.",
    url: "https://sharkwatch.vercel.app/faq",
  },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
