import Image from 'next/image';
import Link from 'next/link';
import { PriceTag } from './price-tag';
import { WishlistToggle } from './wishlist-toggle';

type Props = {
  product: {
    id: string;
    slug: string;
    title: string;
    price: string;
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
}: Props) {
  return (
    <div className="group relative space-y-3">
      <Link
        href={`/shop/${artisan.shopSlug}/${product.slug}`}
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
          <PriceTag price={product.price} currency={product.currency} size="md" />
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
