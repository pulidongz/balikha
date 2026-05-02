import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Used by the seed script for placeholder product images. Drop this
      // entry if/when seeded products migrate to local files.
      { protocol: 'https', hostname: 'placehold.co' },
      // MinIO in dev — uploaded product images live under /balikha-images/.
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/balikha-images/**',
      },
      // R2 in production — wildcard subdomain pattern. Add a custom domain
      // entry here once one is configured (e.g. images.balikha.com).
      { protocol: 'https', hostname: '*.r2.dev' },
    ],
  },
};

export default nextConfig;
