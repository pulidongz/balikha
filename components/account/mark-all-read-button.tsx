'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markAllReadAction } from '@/lib/actions/notifications';

export function MarkAllReadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await markAllReadAction();
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline disabled:opacity-50"
    >
      {isPending ? 'Marking…' : 'Mark all read'}
    </button>
  );
}
