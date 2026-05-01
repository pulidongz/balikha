import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Used by the seed script for placeholder product images. Drop this
      // entry if/when seeded products migrate to local files.
      { protocol: 'https', hostname: 'placehold.co' },
    ],
  },
};

export default nextConfig;
