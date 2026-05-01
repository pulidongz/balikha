import Image from 'next/image';
import Link from 'next/link';
import { PriceTag } from './price-tag';

type Props = {
  product: {
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
};

const DEFAULT_SIZES = '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw';

export function ProductCard({ product, artisan, primaryImage, showArtisan = true }: Props) {
  return (
    <Link
      href={`/shop/${artisan.shopSlug}/${product.slug}`}
      className="group block space-y-3 focus-visible:outline-none"
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
      <div className="space-y-1">
        <h3 className="text-foreground group-hover:text-accent text-base leading-snug transition-colors">
          {product.title}
        </h3>
        {showArtisan && <p className="text-muted-foreground text-xs">{artisan.shopName}</p>}
        <PriceTag price={product.price} currency={product.currency} size="md" />
      </div>
    </Link>
  );
}
