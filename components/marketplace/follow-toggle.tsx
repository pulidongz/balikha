'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toggleFollowAction } from '@/lib/actions/follows';

interface Props {
  artisanProfileId: string;
  initiallyFollowing: boolean;
  isSignedIn: boolean;
}

// Follows are more deliberate than wishlist hearts — text button rather
// than icon, slightly larger hit target. Optimistic-with-rollback to
// match the wishlist toggle UX.
export function FollowToggle({ artisanProfileId, initiallyFollowing, isSignedIn }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isSignedIn) {
      const next = encodeURIComponent(pathname || '/');
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
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={following}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}
