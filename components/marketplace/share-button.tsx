'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Quiet share affordance for public pages. On mobile (and any browser with
// the Web Share API) it opens the native sheet — Messenger / IG DM / etc.,
// which is where PH sharing actually happens. Elsewhere it copies the link.
// This is the growth loop in one button: artists share their own studio,
// visitors share work they love.
export function ShareButton({
  title,
  text,
  path,
}: {
  title: string;
  text?: string;
  // App-relative path (e.g. from studioPath/workPath); resolved against
  // window.location.origin at click time so the shared URL matches the
  // environment it was shared from.
  path: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleShare() {
    setError(null);
    const url = `${window.location.origin}${path}`;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
      } catch (e) {
        // Closing the share sheet rejects with AbortError — an expected
        // user choice, not a failure. Anything else is surfaced.
        if ((e as DOMException).name !== 'AbortError') {
          setError('Could not open the share sheet.');
        }
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the link — you can copy it from the address bar.');
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={handleShare}>
        <Share2 className="mr-1.5 h-4 w-4" />
        {copied ? 'Link copied' : 'Share'}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
