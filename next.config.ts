import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      // MinIO/S3 patterns will be added in feature/seller-dashboard
    ],
  },
};

export default nextConfig;
