'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Flower2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toggleAppreciationAction } from '@/lib/actions/appreciations';
import { isThinCount } from '@/lib/thin-count';
import { cn } from '@/lib/utils';

interface Props {
  productId: string;
  initiallyAppreciated: boolean;
  initialCount: number;
  isSignedIn: boolean;
  /** Value of the `?appreciate=` search param, set when returning from
      sign-in with an appreciation still to apply (same one-shot pattern
      as FollowToggle's `?follow=`). */
  pendingAppreciateId: string | null;
}

// The public response unit (T7) — a sampaguita, not a heart: the heart is
// the private wishlist save; this is the visible nod to the maker.
// Optimistic-with-rollback like the wishlist/follow toggles.
export function AppreciateButton({
  productId,
  initiallyAppreciated,
  initialCount,
  isSignedIn,
  pendingAppreciateId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const pendingAppreciate =
    pendingAppreciateId === productId && isSignedIn && !initiallyAppreciated;
  const [appreciated, setAppreciated] = useState(initiallyAppreciated || pendingAppreciate);
  const [count, setCount] = useState(initialCount + (pendingAppreciate ? 1 : 0));
  const [isPending, startTransition] = useTransition();
  const appliedPending = useRef(false);

  // Completes an appreciation started while signed out. In an effect (not
  // during server render) so link prefetching can never trigger one.
  useEffect(() => {
    if (pendingAppreciateId !== productId || appliedPending.current) return;
    appliedPending.current = true;
    // One-shot param: strip before applying so refresh/back/share of the
    // URL doesn't re-trigger it.
    router.replace(pathname || '/', { scroll: false });
    if (!pendingAppreciate) return;
    startTransition(async () => {
      const result = await toggleAppreciationAction({ productId, appreciate: true });
      if (!result.ok) {
        setAppreciated(false);
        setCount((c) => c - 1);
      }
    });
  }, [pendingAppreciateId, productId, pendingAppreciate, pathname, router]);

  function handleClick() {
    if (!isSignedIn) {
      // Carry the intent through auth so it can be applied on return.
      const next = encodeURIComponent(`${pathname || '/'}?appreciate=${productId}`);
      router.push(`/sign-in?next=${next}`);
      return;
    }

    const next = !appreciated;
    setAppreciated(next);
    setCount((c) => c + (next ? 1 : -1));

    startTransition(async () => {
      const result = await toggleAppreciationAction({ productId, appreciate: next });
      if (!result.ok) {
        setAppreciated(!next);
        setCount((c) => c - (next ? 1 : -1));
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={appreciated}
    >
      <Flower2 className={cn('h-4 w-4', appreciated && 'fill-accent text-accent')} />
      {appreciated ? 'Appreciated' : 'Appreciate'}
      {/* Thin-count rule (T12): the count joins once it stops advertising
          emptiness; the button state alone carries the early days. */}
      {!isThinCount(count) && <span className="text-muted-foreground">{count}</span>}
    </Button>
  );
}
