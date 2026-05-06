'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut, Shield, Store, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/lib/auth-client';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

// Public-pages user menu — visible at md+ in the SiteHeader. "My account"
// is always present. The next slot is mutually exclusive: "My shop" if the
// user has an artisan profile, otherwise "Sell on Balikha" pointing at the
// become-seller flow. "Admin" only shows when isAdmin. Keeps the menu
// honest about which surfaces the current user actually has access to,
// and gives buyers a discoverable path to start selling.
export function SiteHeaderUserMenu({
  userName,
  userEmail,
  hasShop,
  isAdmin,
}: {
  userName: string;
  userEmail: string;
  hasShop: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    router.push('/');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={buttonVariants({
          variant: 'ghost',
          size: 'sm',
          className: 'rounded-full px-1',
        })}
      >
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs">{initialsOf(userName)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="space-y-0.5">
            <p className="text-sm font-medium">{userName}</p>
            <p className="text-muted-foreground text-xs">{userEmail}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>
          <User className="mr-2 h-4 w-4" /> My account
        </DropdownMenuItem>
        {hasShop ? (
          <DropdownMenuItem render={<Link href="/dashboard" />}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> My shop
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem render={<Link href="/dashboard/become-seller" />}>
            <Store className="mr-2 h-4 w-4" /> Sell on Balikha
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <DropdownMenuItem render={<Link href="/admin" />}>
            <Shield className="mr-2 h-4 w-4" /> Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} disabled={signingOut}>
          <LogOut className="mr-2 h-4 w-4" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
