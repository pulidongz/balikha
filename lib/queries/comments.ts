import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { user, workComments } from '@/db/schema';

export interface WorkCommentRow {
  id: string;
  body: string;
  createdAt: Date;
  authorUserId: string;
  authorName: string;
}

/** Flat, chronological comment list for one work, with author names. */
export async function getWorkComments(productId: string): Promise<WorkCommentRow[]> {
  return db
    .select({
      id: workComments.id,
      body: workComments.body,
      createdAt: workComments.createdAt,
      authorUserId: workComments.userId,
      authorName: user.name,
    })
    .from(workComments)
    .innerJoin(user, eq(user.id, workComments.userId))
    .where(eq(workComments.productId, productId))
    .orderBy(asc(workComments.createdAt));
}
