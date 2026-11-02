import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Why SharkWatch",
  description:
    "Why warning time matters: shark bite statistics from ISAF, and how SharkWatch gives lifeguards a confirmed sighting, with evidence, in seconds.",
  alternates: { canonical: "/why-sharkwatch" },
  openGraph: {
    title: "Why SharkWatch | SharkWatch",
    description:
      "Why warning time matters: shark bite statistics from ISAF, and how SharkWatch gives lifeguards a confirmed sighting, with evidence, in seconds.",
    url: "https://sharkwatch.vercel.app/why-sharkwatch",
  },
};

export default function WhyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
