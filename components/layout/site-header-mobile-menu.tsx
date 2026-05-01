'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

type Props = { signedIn: true; userName: string | null } | { signedIn: false; userName?: never };

export function SiteHeaderMobileMenu(props: Props) {
  const [open, setOpen] = useState(false);

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
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="hover:bg-secondary rounded-md px-3 py-2"
            >
              Dashboard
            </Link>
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
