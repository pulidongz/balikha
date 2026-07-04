'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { emailDigestOptOuts } from '@/db/schema';
import { getCurrentUser, NOT_AUTHENTICATED_MESSAGE } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';

// Dashboard counterpart of the email unsubscribe link (T10). Preference
// is an opt-OUT row: enabled = no row.
export async function setDigestEmailPreferenceAction(
  input: unknown,
): Promise<Result<{ enabled: boolean }>> {
  const log = await getRequestLogger();

  const parsed = z.object({ enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const current = await getCurrentUser();
  if (!current) return err(NOT_AUTHENTICATED_MESSAGE);

  if (parsed.data.enabled) {
    await db.delete(emailDigestOptOuts).where(eq(emailDigestOptOuts.userId, current.id));
  } else {
    await db.insert(emailDigestOptOuts).values({ userId: current.id }).onConflictDoNothing();
  }

  log.info({ userId: current.id, enabled: parsed.data.enabled }, 'Digest preference updated');
  return ok({ enabled: parsed.data.enabled });
}
