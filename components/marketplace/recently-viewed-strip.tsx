import Link from 'next/link';
import Image from 'next/image';
import { getRecentlyViewed } from '@/lib/queries/recently-viewed';
import { PriceTag } from './price-tag';

interface Props {
  userId: string | null;
  // Below this threshold the strip renders nothing — saves a "row of 1"
  // sad-looking strip on the homepage. Profile page passes 1 to always
  // show whatever the buyer has if they have anything.
  minItems?: number;
  limit?: number;
  heading?: string;
}

// Server component — fetches its own data so callers don't have to
// thread the recently-viewed list through every page that wants it.
// Does NOT render hearts on the cards: the strip is meant to be a quiet
// recall surface, not another point of interaction. The buyer can click
// through to the product page where the heart is reachable.
export async function RecentlyViewedStrip({
  userId,
  minItems = 4,
  limit = 12,
  heading = 'Recently viewed',
}: Props) {
  const items = await getRecentlyViewed(userId, limit);
  if (items.length < minItems) return null;

  return (
    <section className="space-y-4">
      <h2 className="font-serif text-xl tracking-tight">{heading}</h2>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {items.map((p) => (
          <Link
            key={p.id}
            href={`/shop/${p.artisanShopSlug}/${p.slug}`}
            className="group block w-40 shrink-0 space-y-2 sm:w-44"
          >
            <div className="bg-secondary relative aspect-square overflow-hidden rounded-md">
              {p.primaryImage ? (
                <Image
                  src={p.primaryImage.url}
                  alt={p.primaryImage.altText ?? p.title}
                  fill
                  sizes="180px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
                  No image
                </div>
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-foreground group-hover:text-accent line-clamp-1 text-sm transition-colors">
                {p.title}
              </p>
              <p className="text-muted-foreground line-clamp-1 text-xs">{p.artisanShopName}</p>
              <PriceTag price={p.price} currency={p.currency} size="sm" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
