'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { signOut } from '@/lib/auth-client';

type Props =
  | { signedIn: true; userName: string | null; hasShop: boolean; isAdmin: boolean }
  | {
      signedIn: false;
      userName?: never;
      hasShop?: never;
      isAdmin?: never;
    };

export function SiteHeaderMobileMenu(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleSignOut() {
    setOpen(false);
    startTransition(async () => {
      await signOut();
      router.push('/');
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'md:hidden' })}
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[80vw] max-w-sm flex-col gap-6 sm:w-[360px]">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl">Balikha</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 text-base">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="hover:bg-secondary rounded-md px-3 py-2"
          >
            Browse
          </Link>
          {props.signedIn ? (
            <>
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="hover:bg-secondary rounded-md px-3 py-2"
              >
                My account
              </Link>
              {props.hasShop && (
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="hover:bg-secondary rounded-md px-3 py-2"
                >
                  My shop
                </Link>
              )}
              {props.isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="hover:bg-secondary rounded-md px-3 py-2"
                >
                  Admin
                </Link>
              )}
              {/* Visual separator + destructive-tinted sign-out at the bottom */}
              <div className="my-2 border-t" />
              <button
                type="button"
                onClick={handleSignOut}
                className="text-destructive hover:bg-destructive/10 flex items-center gap-2 rounded-md px-3 py-2 text-left"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="hover:bg-secondary rounded-md px-3 py-2"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setOpen(false)}
                className="hover:bg-secondary rounded-md px-3 py-2"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
