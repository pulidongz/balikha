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
      // Seeded placeholder images. Drop when seeded products migrate to
      // local/MinIO files.
      { protocol: 'https', hostname: 'placehold.co' },
      // MinIO in dev — anything on localhost.
      { protocol: 'http', hostname: 'localhost' },
      // R2 in production — wildcard subdomain pattern. Add a custom domain
      // entry here once one is configured (e.g. images.balikha.com).
      { protocol: 'https', hostname: '*.r2.dev' },
    ],
    // Disable Next's image optimizer in dev. Two reasons:
    // 1. Next 16 refuses to fetch images whose hostname resolves to a
    //    private IP (SSRF defense). MinIO at localhost trips this — there's
    //    no documented opt-out. With unoptimized:true the browser fetches
    //    MinIO directly, skipping Next's image proxy entirely.
    // 2. placehold.co serves SVG by default, which Next blocks unless
    //    dangerouslyAllowSVG is true.
    // For production we want the optimizer back on (R2 lives on a public
    // IP and serves real raster images). Re-enable by removing this flag
    // when wiring the prod build.
    unoptimized: true,
  },
};

export default nextConfig;
