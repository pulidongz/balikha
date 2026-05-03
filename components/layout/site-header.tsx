import Link from 'next/link';
import { Search } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { buttonVariants } from '@/components/ui/button';
import { SearchBar } from '@/components/search/search-bar';
import { getCurrentSession } from '@/lib/auth-helpers';
import { db } from '@/db';
import { artisanProfiles, user as userTable } from '@/db/schema';
import { SiteHeaderMobileMenu } from './site-header-mobile-menu';
import { SiteHeaderUserMenu } from './site-header-user-menu';

export async function SiteHeader() {
  const session = await getCurrentSession();
  const signedIn = session !== null;
  const userName = session?.user.name ?? null;
  const userEmail = session?.user.email ?? null;

  // Conditional menu items ("My shop", "Admin") need to know whether the
  // current user has an artisan profile and whether they're an admin.
  // Fetched in parallel to keep header render fast on signed-in pages;
  // skipped entirely for anonymous visitors.
  let hasShop = false;
  let isAdmin = false;
  if (session) {
    const userId = session.user.id;
    const [shopRow, roleRow] = await Promise.all([
      db
        .select({ id: artisanProfiles.id })
        .from(artisanProfiles)
        .where(eq(artisanProfiles.userId, userId))
        .limit(1),
      db
        .select({ isAdmin: userTable.isAdmin })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1),
    ]);
    hasShop = shopRow.length > 0;
    isAdmin = roleRow[0]?.isAdmin ?? false;
  }

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="font-serif text-xl tracking-tight">
          Balikha
        </Link>

        {/* Search bar claims the middle column at md+. Below md the form
            collapses; the icon link to its right (also md-hidden) is the
            mobile entry point. */}
        <SearchBar className="ml-2 hidden max-w-md flex-1 md:block" />

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/search"
            aria-label="Search"
            className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'md:hidden' })}
          >
            <Search className="h-5 w-5" />
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {signedIn && userName && userEmail ? (
              <SiteHeaderUserMenu
                userName={userName}
                userEmail={userEmail}
                hasShop={hasShop}
                isAdmin={isAdmin}
              />
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
            <SiteHeaderMobileMenu
              signedIn
              userName={userName}
              hasShop={hasShop}
              isAdmin={isAdmin}
            />
          ) : (
            <SiteHeaderMobileMenu signedIn={false} />
          )}
        </div>
      </div>
    </header>
  );
}
