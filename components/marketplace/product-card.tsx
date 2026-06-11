import Image from 'next/image';
import Link from 'next/link';
import { Flower2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initialsOf } from '@/lib/initials';
import { workPath } from '@/lib/routes';
import { isThinCount } from '@/lib/thin-count';
import { PriceTag } from './price-tag';
import { WishlistToggle } from './wishlist-toggle';

type Props = {
  product: {
    id: string;
    slug: string;
    title: string;
    // Null for showcase / commission works (T3): the card simply shows no
    // price — the work speaks for itself; the mode is explicit on the
    // detail page.
    price: string | null;
    currency: string;
  };
  artisan: {
    shopSlug: string;
    shopName: string;
  };
  primaryImage?: {
    url: string;
    altText: string | null;
  } | null;
  showArtisan?: boolean;
  inWishlist?: boolean;
  isSignedIn?: boolean;
  // False when the viewer owns the work (e.g. an artist browsing their own
  // studio page) — saving your own work is meaningless, so no heart.
  showWishlist?: boolean;
  // Pre-formatted seller response-time label (e.g. "a day"), surfaced
  // subtly below the artisan name. The listing page derives this from
  // SellerReputation via bucketLabel — kept as a plain string here so
  // ProductCard, which is also rendered inside the client-side search
  // grid, never pulls the server-only reputation/db module into the
  // client bundle. Omitted when the seller has no response history.
  responseTimeLabel?: string;
  // Feed variant (T6): pass the studio's photo (null still renders the
  // initials fallback) to swap the plain artisan-name line for an
  // avatar + name row. Undefined keeps the classic card.
  artisanAvatarUrl?: string | null;
  // Pre-formatted relative time ("2 days ago"), appended to the artisan
  // row. Formatted by the caller — same plain-string reasoning as
  // responseTimeLabel.
  relativeTimeLabel?: string;
  // Appreciation count (T7), shown subtly beside the price. Hidden below
  // the thin-count threshold (T12) — undefined and a thin count render
  // identically.
  appreciationCount?: number;
};

const DEFAULT_SIZES = '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw';

// The wishlist heart sits as a SIBLING of the <Link>, not inside it — a
// button nested inside <Link> would still trigger navigation on click
// even with stopPropagation, because the Link's pointer handlers are
// installed at the root of its DOM subtree.
export function ProductCard({
  product,
  artisan,
  primaryImage,
  showArtisan = true,
  inWishlist = false,
  isSignedIn = false,
  showWishlist = true,
  responseTimeLabel,
  artisanAvatarUrl,
  relativeTimeLabel,
  appreciationCount,
}: Props) {
  const showAppreciations = appreciationCount !== undefined && !isThinCount(appreciationCount);
  return (
    <div className="group relative space-y-3">
      <Link
        href={workPath(artisan.shopSlug, product.slug)}
        className="block focus-visible:outline-none"
      >
        <div className="bg-secondary relative aspect-square overflow-hidden rounded-lg">
          {primaryImage ? (
            <Image
              src={primaryImage.url}
              alt={primaryImage.altText ?? product.title}
              fill
              sizes={DEFAULT_SIZES}
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              No image
            </div>
          )}
        </div>
        <div className="mt-3 space-y-1">
          <h3 className="text-foreground group-hover:text-accent text-base leading-snug transition-colors">
            {product.title}
          </h3>
          {showArtisan &&
            (artisanAvatarUrl !== undefined ? (
              <span className="flex items-center gap-1.5">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={artisanAvatarUrl ?? undefined} alt="" />
                  <AvatarFallback className="text-[9px]">
                    {initialsOf(artisan.shopName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground text-xs">
                  {artisan.shopName}
                  {relativeTimeLabel && ` · ${relativeTimeLabel}`}
                </span>
              </span>
            ) : (
              <p className="text-muted-foreground text-xs">{artisan.shopName}</p>
            ))}
          {responseTimeLabel && (
            <p className="text-muted-foreground text-xs">Responds within {responseTimeLabel}</p>
          )}
          {(product.price !== null || showAppreciations) && (
            <span className="flex items-center gap-3">
              {product.price !== null && (
                <PriceTag price={product.price} currency={product.currency} size="md" />
              )}
              {showAppreciations && (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Flower2 className="h-3.5 w-3.5" aria-hidden />
                  {appreciationCount}
                  <span className="sr-only">appreciations</span>
                </span>
              )}
            </span>
          )}
        </div>
      </Link>
      {showWishlist && (
        <WishlistToggle
          productId={product.id}
          initiallyInWishlist={inWishlist}
          isSignedIn={isSignedIn}
          className="absolute top-2 right-2"
        />
      )}
    </div>
  );
}
