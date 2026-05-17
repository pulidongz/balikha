'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import { markReadAction } from '@/lib/actions/notifications';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  target: { kind: string; id: string; url?: string } | null;
  readAt: Date | null;
  createdAt: Date;
}

// Click handler is fire-and-forget: navigation continues regardless of
// whether the mark-read action lands. Unread items carry a small accent
// dot and a tonal background, a quieter signal than a "NEW" badge and
// easy on the eye when scanning a long list.
//
// `variant="preview"` is for the /account landing's notifications section.
// Compact: no dot, no body text, no background, just title and time-ago.
// The full-list page keeps the default `variant="full"`.
export function NotificationItem({
  notification,
  variant = 'full',
}: {
  notification: Notification;
  variant?: 'full' | 'preview';
}) {
  const url = notification.target?.url ?? '#';
  const [optimisticallyRead, setOptimisticallyRead] = useState(notification.readAt !== null);
  const [, startTransition] = useTransition();

  function handleClick() {
    if (optimisticallyRead) return;
    setOptimisticallyRead(true);
    startTransition(async () => {
      await markReadAction({ id: notification.id });
    });
  }

  if (variant === 'preview') {
    return (
      <li>
        <Link
          href={url}
          onClick={handleClick}
          className="hover:bg-secondary/40 -mx-2 block rounded-md px-2 py-2 transition-colors"
        >
          <div className="flex items-baseline gap-2">
            <p
              className={cn(
                'flex-1 truncate text-sm',
                optimisticallyRead ? 'text-foreground' : 'text-foreground font-medium',
              )}
            >
              {notification.title}
            </p>
            <p className="text-muted-foreground shrink-0 text-xs">
              {formatRelativeTime(notification.createdAt)}
            </p>
          </div>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={url}
        onClick={handleClick}
        className={cn(
          'block rounded-md px-3 py-3 transition-colors',
          optimisticallyRead ? 'hover:bg-secondary/40' : 'bg-secondary/40 hover:bg-secondary/60',
        )}
      >
        <div className="flex items-start gap-2">
          {!optimisticallyRead && (
            <span aria-hidden className="bg-accent mt-1.5 size-1.5 shrink-0 rounded-full" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{notification.title}</p>
            {notification.body && (
              <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
                {notification.body}
              </p>
            )}
            <p className="text-muted-foreground mt-1 text-xs">
              {formatRelativeTime(notification.createdAt)}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}
