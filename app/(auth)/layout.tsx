import type { ReactNode } from 'react';
import Link from 'next/link';
import { getAuthPanelMedia } from '@/lib/queries/auth-panel';
import { AuthShell } from '@/components/auth/auth-shell';
import { AuthSlideshow } from '@/components/auth/auth-slideshow';
import { workPath } from '@/lib/routes';

// This layout queries the DB (getAuthPanelMedia) for the photo panel.
// forgot-password and reset-password would otherwise be statically
// prerendered, executing that query at build time — and the CI/release
// build jobs run with a deliberately unreachable DATABASE_URL ("never
// connected to at build"). force-dynamic here covers all (auth) child
// routes and keeps the panel's media request-time fresh, same rationale
// as the sign-in page's own force-dynamic for the Google flag (PR #64).
export const dynamic = 'force-dynamic';

// Two-pane editorial shell for every (auth) page: form on cream, the
// featured piece opposite (lg+ only; side alternates per route — see
// AuthShell). Media is a daily, fair rotation across artists shown as a
// crossfade slideshow of one piece (see getAuthPanelMedia); the caption
// links to that product. When there is no eligible photo, the panel is the
// navy brand statement alone.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const media = await getAuthPanelMedia();
  return (
    <AuthShell
      panel={
        <>
          {media && (
            <AuthSlideshow
              images={media.images}
              alt={`${media.workTitle} by ${media.shopName}`}
              sizes="(min-width: 1024px) 44vw, 0px"
            />
          )}
          {/* Decorative scrim — pointer-events-none so the slideshow dots
              beneath stay clickable. */}
          <div className="from-primary/10 to-primary/70 pointer-events-none absolute inset-0 bg-gradient-to-b" />
          {/* Must remain the last sibling so the caption link paints above the
              slideshow stack and stays clickable. */}
          <div className="absolute right-8 bottom-8 left-8">
            {/* Staggered entrance — same auth-rise + inline-delay pattern
                as the auth status surfaces. */}
            <p
              className="auth-rise text-primary-foreground text-title font-serif tracking-tight"
              style={{ animationDelay: '200ms' }}
            >
              Handmade, from the Philippines.
            </p>
            {media && (
              <Link
                href={workPath(media.shopSlug, media.productSlug)}
                className="auth-rise text-primary-foreground/75 hover:text-primary-foreground mt-1 inline-block text-sm transition-colors"
                style={{ animationDelay: '320ms' }}
              >
                {media.workTitle} · {media.shopName}
              </Link>
            )}
          </div>
        </>
      }
    >
      <Link
        href="/"
        className="text-foreground/80 hover:text-foreground mb-8 font-serif text-2xl tracking-tight transition-colors"
      >
        Balikha
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </AuthShell>
  );
}
