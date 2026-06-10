import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

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
  // T1 community pivot: artisan pages moved from /shop/* to /studio/*.
  // permanent:true emits a 308 (Next's method-preserving equivalent of a
  // 301 — search engines treat both as permanent). :path* covers both the
  // studio page and work pages; query strings pass through automatically.
  async redirects() {
    return [{ source: '/shop/:path*', destination: '/studio/:path*', permanent: true }];
  },
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

// Wrap the config so the Sentry build plugin uploads source maps and
// creates a release during `next build` (ticket #34). All three vars
// below are BUILD-ONLY (consumed by the plugin, not app runtime) and are
// supplied by release.yml; absent locally/CI, the plugin no-ops the upload
// and the build still succeeds. The DSN is NOT here — it is a runtime/
// build-inlined app var validated by env.ts.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet plugin logs except in CI, where they aid debugging.
  silent: !process.env.CI,
  // Better stack frames for client chunks served from the CDN domain.
  widenClientFileUpload: true,
  // Upload maps, then DELETE them from the shipped bundle so readable
  // source is never served publicly from images/app origins.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Tree-shake the Sentry SDK's own debug logger from the client bundle.
  // Bundler-agnostic (the `webpack.treeshake` form is a no-op under Turbopack,
  // which this project builds with).
  bundleSizeOptimizations: { excludeDebugStatements: true },
  // Upload once after all builds complete — the supported path for
  // Next 15.4.1+ / Turbopack (this project builds with Turbopack).
  useRunAfterProductionCompileHook: true,
  // Next 16 + Turbopack requires an application key for source-map
  // association. Stable, non-secret identifier for this app.
  _experimental: { turbopackApplicationKey: 'balikha' },
});
