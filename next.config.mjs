/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  async redirects() {
    return [
      // How It Works used to be its own page; it now lives as a section
      // on the homepage, so the old URL redirects there instead of 404ing.
      {
        source: "/how-it-works",
        destination: "/#how-it-works",
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
