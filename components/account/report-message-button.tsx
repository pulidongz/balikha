'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { reportMessage } from '@/lib/actions/messaging';

export function ReportMessageButton({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await reportMessage({
        messageId,
        reason: reason.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-destructive text-xs underline-offset-4 hover:underline"
      >
        Report
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {done ? (
            <>
              <DialogHeader>
                <DialogTitle>Thanks for letting us know</DialogTitle>
                <DialogDescription>A Balikha admin will review this report.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Report this message</DialogTitle>
                <DialogDescription>
                  Let us know what&rsquo;s wrong. The message stays visible to you while admins
                  review. To understand the context, a Balikha admin will see the conversation
                  around the reported message.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-4">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="What's wrong with this message? (optional)"
                  rows={4}
                  maxLength={2000}
                />
                {error && (
                  <p
                    className="text-destructive bg-destructive/10 rounded-md p-2 text-sm"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending ? 'Submitting…' : 'Report'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
