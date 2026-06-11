import Image from 'next/image';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initialsOf } from '@/lib/initials';
import { studioPath } from '@/lib/routes';

interface Props {
  update: {
    id: string;
    body: string;
    images: Array<{ url: string }>;
    artisanShopSlug: string;
    artisanShopName: string;
    artisanPhotoUrl: string | null;
  };
  relativeTimeLabel: string;
}

// Feed card for a studio update (T9). No detail page — the card links to
// the studio's Updates section, where the conversation lives.
export function UpdateCard({ update, relativeTimeLabel }: Props) {
  const cover = update.images[0];
  const extraCount = update.images.length - 1;

  return (
    <Link
      href={`${studioPath(update.artisanShopSlug)}#updates`}
      className="group block space-y-3 focus-visible:outline-none"
    >
      <div className="bg-secondary relative aspect-square overflow-hidden rounded-lg">
        {cover ? (
          <Image
            src={cover.url}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
            {update.body.slice(0, 120)}
          </div>
        )}
        {extraCount > 0 && (
          <span className="bg-background/85 text-foreground absolute right-2 bottom-2 rounded-full px-2 py-0.5 text-xs">
            +{extraCount} more
          </span>
        )}
        <span className="bg-background/85 text-muted-foreground absolute top-2 left-2 rounded-full px-2 py-0.5 text-[0.65rem] tracking-wider uppercase">
          Update
        </span>
      </div>
      <div className="space-y-1">
        {update.body && (
          <p className="text-foreground line-clamp-2 text-base leading-snug">{update.body}</p>
        )}
        <span className="flex items-center gap-1.5">
          <Avatar className="h-5 w-5">
            <AvatarImage src={update.artisanPhotoUrl ?? undefined} alt="" />
            <AvatarFallback className="text-[9px]">
              {initialsOf(update.artisanShopName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground text-xs">
            {update.artisanShopName} · {relativeTimeLabel}
          </span>
        </span>
      </div>
    </Link>
  );
}
