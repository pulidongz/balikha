'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, Settings } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { signOut } from '@/lib/auth-client';
import { DashboardNav } from './dashboard-nav';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function DashboardHeaderMenu({
  userName,
  userEmail,
  shopSlug,
}: {
  userName: string;
  userEmail: string;
  shopSlug: string | null;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    router.push('/');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {/* Mobile sidebar trigger — visible only below lg */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger
          aria-label="Open navigation"
          className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'lg:hidden' })}
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-[80vw] max-w-xs sm:w-72">
          <SheetHeader>
            <SheetTitle className="font-serif text-lg">Dashboard</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <DashboardNav onNavigate={() => setSheetOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {shopSlug && (
        <Link
          href={`/shop/${shopSlug}`}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'hidden sm:inline-flex',
          })}
        >
          View shop →
        </Link>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className={buttonVariants({
            variant: 'ghost',
            size: 'icon',
            className: 'rounded-full',
          })}
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initialsOf(userName)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="space-y-0.5">
            <p className="text-sm font-medium">{userName}</p>
            <p className="text-muted-foreground text-xs">{userEmail}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {shopSlug && (
            <DropdownMenuItem
              render={<Link href={`/shop/${shopSlug}`} target="_blank" rel="noreferrer" />}
            >
              View public shop
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} disabled={signingOut}>
            <LogOut className="mr-2 h-4 w-4" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
