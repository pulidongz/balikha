'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toggleWishlistAction } from '@/lib/actions/wishlist';

interface Props {
  productId: string;
  initiallyInWishlist: boolean;
  isSignedIn: boolean;
  /** Visual variant: `overlay` for cards (semi-transparent on image), `inline` for the product detail row. */
  variant?: 'overlay' | 'inline';
  className?: string;
}

// Optimistic toggle: state flips on click and the action runs in the
// background. On error, state rolls back. Per buyer plan §6: "Wishlist
// toggle and follow toggle MUST be optimistic. […] A 200ms server
// roundtrip would feel sluggish for these high-frequency interactions."
export function WishlistToggle({
  productId,
  initiallyInWishlist,
  isSignedIn,
  variant = 'overlay',
  className,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [inWishlist, setInWishlist] = useState(initiallyInWishlist);
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    // Prevents the surrounding <Link> on product cards from navigating.
    e.preventDefault();
    e.stopPropagation();

    if (!isSignedIn) {
      const next = encodeURIComponent(pathname || '/');
      router.push(`/sign-in?next=${next}`);
      return;
    }

    const next = !inWishlist;
    setInWishlist(next);

    startTransition(async () => {
      const result = await toggleWishlistAction({ productId, add: next });
      if (!result.ok) setInWishlist(!next);
    });
  }

  const baseClasses =
    variant === 'overlay'
      ? 'bg-background/80 hover:bg-background border-transparent backdrop-blur-sm'
      : 'bg-background border-border hover:bg-secondary';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-pressed={inWishlist}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-50',
        baseClasses,
        className,
      )}
    >
      <Heart
        className={cn(
          'h-4 w-4 transition-colors',
          inWishlist ? 'fill-accent text-accent' : 'text-muted-foreground',
        )}
      />
    </button>
  );
}
