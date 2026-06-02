import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow Caddy-proxied dev URLs to connect to the dev server's HMR WebSocket
  // and pass Next 16's cross-origin dev checks. Without this, Next responds
  // to the WS upgrade with a literal "Unauthorized" body (which Caddy reports
  // as a "malformed HTTP response" 502 since the dev server didn't speak the
  // WS protocol back). A broken HMR socket can also stall React hydration
  // mid-tree, leaving SSR-rendered buttons with no click handler attached —
  // which is why "Continue with Google" silently does nothing on these URLs.
  //
  // localhost:3000 is implicitly allowed (the dev server's own host).
  allowedDevOrigins: ['dev.balikha.art', 'balikha.localhost'],
  images: {
    remotePatterns: [
      // Dev-only: placeholder images, local MinIO, and the rate-limited
      // *.r2.dev URL. All gated out of prod so the optimizer's SSRF allowlist
      // is minimal in production (prod serves only from the custom domain).
      ...(process.env.NODE_ENV !== 'production'
        ? [
            { protocol: 'https' as const, hostname: 'placehold.co' },
            { protocol: 'http' as const, hostname: 'localhost' },
            { protocol: 'https' as const, hostname: '*.r2.dev' },
          ]
        : []),
      // Production R2 images served via the Cloudflare custom domain.
      { protocol: 'https', hostname: 'images.balikha.art' },
    ],
    // Optimizer OFF in dev (MinIO resolves to a private IP that Next's
    // optimizer SSRF-blocks; placehold.co serves SVG). ON in prod, where
    // R2 serves public raster images. NODE_ENV is set by the Next CLI —
    // reading it here is the same outside-Next carve-out as drizzle.config.
    unoptimized: process.env.NODE_ENV !== 'production',
    // Conservative settings so a single image doesn't fan out into many
    // sharp encodes on the 1 GB origin; optimized variants are disk-cached.
    formats: ['image/webp'],
    minimumCacheTTL: 86400,
    deviceSizes: [640, 828, 1080, 1200, 1920],
    imageSizes: [128, 256, 384],
  },
};

export default nextConfig;
