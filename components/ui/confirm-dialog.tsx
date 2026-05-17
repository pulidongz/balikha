'use client';

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Result } from '@/lib/result';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for true deletions; navy (default) otherwise. */
  destructive?: boolean;
  /** Runs the confirmed action and returns the action's Result. */
  onConfirm: () => Promise<Result<unknown>>;
  /** Runs after onConfirm resolves ok — typically router.refresh(). */
  onSuccess?: () => void;
}

// A styled confirmation step for actions that are hard to undo (archiving a
// listing, deleting an address). Replaces native confirm(): focus-managed,
// on-brand, and able to surface a server error inline instead of failing
// silently to the console.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onSuccess,
}: ConfirmDialogProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onSuccess?.();
    });
  }

  // Clear a stale error when the dialog is dismissed so it doesn't flash
  // on the next open.
  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? (pendingLabel ?? 'Working…') : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
