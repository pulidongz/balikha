'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { markReportActioned, markReportDismissed } from '@/lib/actions/messaging';

export function AdminReportActions({
  reportId,
  status,
}: {
  reportId: string;
  status: 'open' | 'reviewed_actioned' | 'reviewed_dismissed';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status !== 'open') {
    return (
      <p className="text-muted-foreground text-sm">
        {status === 'reviewed_actioned' ? 'Actioned' : 'Dismissed'}.
      </p>
    );
  }

  function handle(kind: 'actioned' | 'dismissed') {
    startTransition(async () => {
      const action = kind === 'actioned' ? markReportActioned : markReportDismissed;
      const result = await action({ reportId });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button onClick={() => handle('dismissed')} variant="outline" disabled={pending}>
        Dismiss
      </Button>
      <Button onClick={() => handle('actioned')} variant="destructive" disabled={pending}>
        Action
      </Button>
    </div>
  );
}
