'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toggleFollowAction } from '@/lib/actions/follows';

interface Props {
  artisanProfileId: string;
  initiallyFollowing: boolean;
  isSignedIn: boolean;
  /** Value of the `?follow=` search param, set when returning from sign-in
      with a follow still to apply. */
  pendingFollowId: string | null;
}

// Follows are more deliberate than wishlist hearts — text button rather
// than icon, slightly larger hit target. Optimistic-with-rollback to
// match the wishlist toggle UX.
export function FollowToggle({
  artisanProfileId,
  initiallyFollowing,
  isSignedIn,
  pendingFollowId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  // A pending follow (signed-out click → sign-in → back here with
  // ?follow=<id>) renders optimistically as "Following" from the first
  // frame; the effect below persists it.
  const pendingFollow = pendingFollowId === artisanProfileId && isSignedIn && !initiallyFollowing;
  const [following, setFollowing] = useState(initiallyFollowing || pendingFollow);
  const [isPending, startTransition] = useTransition();
  const appliedPendingFollow = useRef(false);

  // Completes the pending follow. Applied in an effect (not during server
  // render) so link prefetching can never trigger a follow.
  useEffect(() => {
    if (pendingFollowId !== artisanProfileId || appliedPendingFollow.current) return;
    appliedPendingFollow.current = true;
    // One-shot param: strip it before applying so refresh/back/share of the
    // URL doesn't re-trigger the follow.
    router.replace(pathname || '/', { scroll: false });
    if (!pendingFollow) return;
    startTransition(async () => {
      const result = await toggleFollowAction({ artisanProfileId, follow: true });
      if (!result.ok) setFollowing(false);
    });
  }, [pendingFollowId, artisanProfileId, pendingFollow, pathname, router]);

  function handleClick() {
    if (!isSignedIn) {
      // Carry the follow intent through auth so it can be applied on return.
      const next = encodeURIComponent(`${pathname || '/'}?follow=${artisanProfileId}`);
      router.push(`/sign-in?next=${next}`);
      return;
    }

    const next = !following;
    setFollowing(next);

    startTransition(async () => {
      const result = await toggleFollowAction({ artisanProfileId, follow: next });
      if (!result.ok) setFollowing(!next);
    });
  }

  return (
    <Button
      type="button"
      variant={following ? 'secondary' : 'outline'}
      size="lg"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={following}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}
