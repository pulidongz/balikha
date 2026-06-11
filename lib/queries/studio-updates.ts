import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { studioUpdateImages, studioUpdates } from '@/db/schema';

export interface StudioUpdateRow {
  id: string;
  body: string;
  createdAt: Date;
  images: Array<{ url: string; position: number }>;
}

/** A studio's updates, newest first, images batched in one query. */
export async function getStudioUpdates(
  artisanProfileId: string,
  limit = 20,
): Promise<StudioUpdateRow[]> {
  const rows = await db
    .select({ id: studioUpdates.id, body: studioUpdates.body, createdAt: studioUpdates.createdAt })
    .from(studioUpdates)
    .where(eq(studioUpdates.artisanProfileId, artisanProfileId))
    .orderBy(desc(studioUpdates.createdAt), desc(studioUpdates.id))
    .limit(limit);
  if (rows.length === 0) return [];

  const images = await db
    .select({
      updateId: studioUpdateImages.updateId,
      url: studioUpdateImages.url,
      position: studioUpdateImages.position,
    })
    .from(studioUpdateImages)
    .where(
      inArray(
        studioUpdateImages.updateId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(studioUpdateImages.position));

  const imagesByUpdate = new Map<string, Array<{ url: string; position: number }>>();
  for (const img of images) {
    const list = imagesByUpdate.get(img.updateId) ?? [];
    list.push({ url: img.url, position: img.position });
    imagesByUpdate.set(img.updateId, list);
  }

  return rows.map((r) => ({ ...r, images: imagesByUpdate.get(r.id) ?? [] }));
}
