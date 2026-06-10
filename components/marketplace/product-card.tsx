import Image from 'next/image';
import Link from 'next/link';
import { workPath } from '@/lib/routes';
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
  // Pre-formatted seller response-time label (e.g. "a day"), surfaced
  // subtly below the artisan name. The listing page derives this from
  // SellerReputation via bucketLabel — kept as a plain string here so
  // ProductCard, which is also rendered inside the client-side search
  // grid, never pulls the server-only reputation/db module into the
  // client bundle. Omitted when the seller has no response history.
  responseTimeLabel?: string;
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
  responseTimeLabel,
}: Props) {
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
          {showArtisan && <p className="text-muted-foreground text-xs">{artisan.shopName}</p>}
          {responseTimeLabel && (
            <p className="text-muted-foreground text-xs">Responds within {responseTimeLabel}</p>
          )}
          {product.price !== null && (
            <PriceTag price={product.price} currency={product.currency} size="md" />
          )}
        </div>
      </Link>
      <WishlistToggle
        productId={product.id}
        initiallyInWishlist={inWishlist}
        isSignedIn={isSignedIn}
        className="absolute top-2 right-2"
      />
    </div>
  );
}
