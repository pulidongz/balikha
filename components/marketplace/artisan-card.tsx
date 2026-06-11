import Image from 'next/image';
import Link from 'next/link';
import { initialsOf } from '@/lib/initials';
import { studioPath } from '@/lib/routes';
import { isThinCount } from '@/lib/thin-count';

type Props = {
  artisan: {
    shopSlug: string;
    shopName: string;
    location: string | null;
    bannerImageUrl: string | null;
  };
  productCount?: number;
};

export function ArtisanCard({ artisan, productCount }: Props) {
  return (
    <Link
      href={studioPath(artisan.shopSlug)}
      className="group block space-y-3 focus-visible:outline-none"
    >
      <div className="bg-secondary relative aspect-[4/5] overflow-hidden rounded-lg">
        {artisan.bannerImageUrl ? (
          <Image
            src={artisan.bannerImageUrl}
            alt={artisan.shopName}
            fill
            sizes="(min-width: 768px) 25vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="bg-secondary text-muted-foreground flex h-full items-center justify-center font-serif text-4xl">
            {initialsOf(artisan.shopName)}
          </div>
        )}
      </div>
      <div className="space-y-0.5">
        <h3 className="font-serif text-lg leading-tight">{artisan.shopName}</h3>
        <p className="text-muted-foreground text-xs">
          {artisan.location ?? '—'}
          {/* Thin-count rule (T12): "· 2 pieces" advertises a sparse
              studio; the count joins once it carries weight. */}
          {productCount !== undefined &&
            !isThinCount(productCount) &&
            ` · ${productCount} ${productCount === 1 ? 'piece' : 'pieces'}`}
        </p>
      </div>
    </Link>
  );
}
