import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentSession } from '@/lib/auth-helpers';
import { SiteHeaderMobileMenu } from './site-header-mobile-menu';
import { SiteHeaderUserMenu } from './site-header-user-menu';

export async function SiteHeader() {
  const session = await getCurrentSession();
  const signedIn = session !== null;
  const userName = session?.user.name ?? null;
  const userEmail = session?.user.email ?? null;

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-serif text-xl tracking-tight">
          Balikha
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {signedIn && userName && userEmail ? (
            <SiteHeaderUserMenu userName={userName} userEmail={userEmail} />
          ) : (
            <>
              <Link href="/sign-in" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                Sign in
              </Link>
              <Link href="/sign-up" className={buttonVariants({ size: 'sm' })}>
                Sign up
              </Link>
            </>
          )}
        </nav>

        {signedIn ? (
          <SiteHeaderMobileMenu signedIn userName={userName} />
        ) : (
          <SiteHeaderMobileMenu signedIn={false} />
        )}
      </div>
    </header>
  );
}
