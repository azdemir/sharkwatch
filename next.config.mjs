/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // ffmpeg-static / ffprobe-static ship platform binaries. If Next bundles
  // them, the bundled path does not point at a real binary and uploads
  // fail with spawn ENOENT, so Live can never run. Keep them external
  // so the server loads the real node_modules binaries at runtime.
  experimental: {
    serverComponentsExternalPackages: ['ffmpeg-static', 'ffprobe-static'],
  },
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
