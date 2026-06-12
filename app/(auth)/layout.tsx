import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getAuthPanelMedia } from '@/lib/queries/auth-panel';

// This layout queries the DB (getAuthPanelMedia) for the photo panel.
// forgot-password and reset-password would otherwise be statically
// prerendered, executing that query at build time — and the CI/release
// build jobs run with a deliberately unreachable DATABASE_URL ("never
// connected to at build"). force-dynamic here covers all (auth) child
// routes and keeps the panel's media request-time fresh, same rationale
// as the sign-in page's own force-dynamic for the Google flag (PR #64).
export const dynamic = 'force-dynamic';

// Two-pane editorial shell for every (auth) page: form on cream at left,
// featured-work photo at right (lg+ only). Media comes from the founder-
// curated feature with fallbacks (see getAuthPanelMedia); when there is
// no photo at all, the panel is the navy brand statement alone.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const media = await getAuthPanelMedia();
  return (
    <main className="flex min-h-screen">
      <div className="bg-background flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link
          href="/"
          className="text-foreground/80 hover:text-foreground mb-8 font-serif text-2xl tracking-tight transition-colors"
        >
          Balikha
        </Link>
        <div className="w-full max-w-md">{children}</div>
      </div>
      {/* Decorative panel — atmosphere, not navigation. Hidden below lg. */}
      <aside aria-hidden="true" className="bg-primary relative hidden lg:block lg:w-[44%]">
        {media && (
          <Image
            src={media.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 44vw, 0px"
            className="object-cover"
          />
        )}
        <div className="from-primary/10 to-primary/70 absolute inset-0 bg-gradient-to-b" />
        <div className="absolute right-8 bottom-8 left-8">
          <p className="text-primary-foreground font-serif text-2xl tracking-tight">
            Handmade, from the Philippines.
          </p>
          {media && (
            <p className="text-primary-foreground/75 mt-1 text-sm">
              {media.workTitle} · {media.shopName}
            </p>
          )}
        </div>
      </aside>
    </main>
  );
}
