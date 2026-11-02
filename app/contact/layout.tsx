import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Bring SharkWatch to your beach. Pilot enquiries for drone shark detection and lifeguard alerts.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact | SharkWatch",
    description:
      "Bring SharkWatch to your beach. Pilot enquiries for drone shark detection and lifeguard alerts.",
    url: "https://sharkwatch.vercel.app/contact",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
