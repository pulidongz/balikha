'use client';

import { useEffect } from 'react';
import { markThreadRead } from '@/lib/actions/messaging';

// Side-effect-only client component: on mount, fires markThreadRead as
// a server action so the viewer's unread notification for this thread
// is cleared. Why a client effect instead of a direct call in the
// server component render — Next 16 forbids revalidatePath/Tag during
// render. markThreadRead's `revalidatePath('/account','layout')` and
// `revalidatePath('/dashboard','layout')` are only valid in server-
// action context, which is exactly what a server action invoked from a
// client effect provides.
//
// Fire-and-forget: the read-receipt is passive UX, so a transient
// failure (DB blip) is logged but not surfaced — the badge stays at
// its current count and the next visit retries.
export function MarkThreadReadOnMount({ threadId }: { threadId: string }) {
  useEffect(() => {
    markThreadRead({ threadId }).catch((err) => {
      console.error('markThreadRead failed', err);
    });
  }, [threadId]);
  return null;
}
