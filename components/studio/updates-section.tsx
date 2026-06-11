import Image from 'next/image';
import { formatRelativeTime } from '@/lib/format';
import { getStudioUpdates } from '@/lib/queries/studio-updates';
import { UpdateComposer } from './update-composer';
import { UpdateItemActions } from './update-item-actions';

interface Props {
  artisanProfileId: string;
  isOwner: boolean;
}

// The studio's Updates section (T9). Visitors only see it when updates
// exist — an empty section would advertise absence (T12 philosophy).
// Owners always see it, because the composer lives here.
export async function UpdatesSection({ artisanProfileId, isOwner }: Props) {
  const updates = await getStudioUpdates(artisanProfileId);
  if (updates.length === 0 && !isOwner) return null;

  return (
    <section id="updates" aria-label="Updates" className="space-y-6">
      <h2 className="font-serif text-2xl tracking-tight">Updates</h2>

      {isOwner && <UpdateComposer />}

      {updates.length === 0 ? (
        isOwner && (
          <p className="text-muted-foreground text-sm">
            Nothing posted yet — kiln openings, works in progress, and process shots all belong
            here.
          </p>
        )
      ) : (
        <ul className="space-y-10">
          {updates.map((u) => (
            <li key={u.id} className="space-y-3">
              <div
                className={
                  u.images.length === 1
                    ? 'grid max-w-xl grid-cols-1'
                    : 'grid grid-cols-2 gap-2 sm:max-w-2xl'
                }
              >
                {u.images.map((img) => (
                  <div
                    key={img.url}
                    className="bg-secondary relative aspect-square overflow-hidden rounded-lg"
                  >
                    <Image
                      src={img.url}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 320px, 50vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
              {u.body && (
                <p className="max-w-2xl text-base leading-relaxed whitespace-pre-line">{u.body}</p>
              )}
              <p className="text-muted-foreground flex items-center gap-3 text-xs">
                {formatRelativeTime(u.createdAt)}
                {isOwner && <UpdateItemActions updateId={u.id} initialBody={u.body} />}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
