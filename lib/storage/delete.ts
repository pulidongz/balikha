import { DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { BUCKET, s3 } from './client';
import { logger } from '@/lib/logger';

// Storage deletes are best-effort. By the time these run, the DB row that
// pointed at the object is already gone, so a missing/stale object isn't a
// user-visible problem — it's just an orphan we'll catch in a periodic
// sweep (out-of-scope per plan §10). Failures are logged for ops, never
// re-raised, so a flaky storage layer never blocks user-facing actions.

export async function deleteObject(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (e) {
    logger.error({ err: e, key }, 'Failed to delete storage object');
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  } catch (e) {
    logger.error({ err: e, count: keys.length }, 'Failed to bulk-delete storage objects');
  }
}
