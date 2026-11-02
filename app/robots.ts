import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/media/"],
      },
    ],
    sitemap: "https://sharkwatch.vercel.app/sitemap.xml",
  };
}
