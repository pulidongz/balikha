'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut, MessageSquare, Shield, Store, User } from 'lucide-react';
import { FeedbackDialog } from '@/components/feedback/feedback-dialog';
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
// is always present. The next slot is mutually exclusive: "My studio" if the
// user has an artisan profile, otherwise "Share your work" pointing at the
// become-seller flow. "Admin" only shows for the admin role. Keeps the menu
// honest about which surfaces the current user actually has access to,
// and gives buyers a discoverable path to open a studio of their own.
export function SiteHeaderUserMenu({
  userName,
  userEmail,
  hasShop,
  role,
}: {
  userName: string;
  userEmail: string;
  hasShop: boolean;
  // Better Auth types the session role as nullable (the admin plugin marks the
  // field optional); our column is NOT NULL but the inferred type is widened.
  // `=== 'admin'` correctly treats null/undefined as "not admin".
  role: string | null | undefined;
}) {
  const isAdmin = role === 'admin';
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          // size:icon-sm gives a strict 28×28 square so rounded-full produces
          // a true circle. We turn OFF the ghost variant's bg-muted hover
          // (it just merges with the AvatarFallback's matching bg-muted and
          // leaves only the avatar's after:border showing — the "weird
          // outline" effect). Hover state is instead driven by the
          // AvatarFallback below via group-hover/button:.
          className={buttonVariants({
            variant: 'ghost',
            size: 'icon-sm',
            className:
              'cursor-pointer rounded-full hover:bg-transparent aria-expanded:bg-transparent',
          })}
        >
          <Avatar className="h-7 w-7 after:hidden">
            <AvatarFallback className="group-hover/button:bg-foreground group-hover/button:text-background group-aria-expanded/button:bg-foreground group-aria-expanded/button:text-background text-xs transition-colors">
              {initialsOf(userName)}
            </AvatarFallback>
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
              <LayoutDashboard className="mr-2 h-4 w-4" /> My studio
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem render={<Link href="/dashboard/become-seller" />}>
              <Store className="mr-2 h-4 w-4" /> Share your work
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem render={<Link href="/admin" />}>
              <Shield className="mr-2 h-4 w-4" /> Admin
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {/* Defer open to a microtask so the menu finishes closing before the
            dialog's focus trap activates — avoids a focus-restore race between
            the two Base UI portal-managed components. */}
          <DropdownMenuItem onClick={() => setTimeout(() => setFeedbackOpen(true), 0)}>
            <MessageSquare className="mr-2 h-4 w-4" /> Send feedback
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} disabled={signingOut}>
            <LogOut className="mr-2 h-4 w-4" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Rendered outside DropdownMenu so closing the menu doesn't unmount it. */}
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
