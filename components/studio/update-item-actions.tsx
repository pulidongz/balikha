'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { deleteStudioUpdateAction, editStudioUpdateAction } from '@/lib/actions/studio-updates';

interface Props {
  updateId: string;
  initialBody: string;
}

// Owner-only edit (text) and delete controls for a studio update (T9).
// Photos are immutable — delete and repost beats a photo-editing UI.
export function UpdateItemActions({ updateId, initialBody }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await editStudioUpdateAction({ updateId, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        className="text-muted-foreground hover:text-destructive text-xs underline-offset-4 hover:underline"
      >
        Delete
      </button>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit update</DialogTitle>
          </DialogHeader>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={1000}
            aria-label="Update text"
          />
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this update?"
        description="The update and its photos are removed for everyone. This cannot be undone."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        destructive
        onConfirm={() => deleteStudioUpdateAction({ updateId })}
        onSuccess={() => router.refresh()}
      />
    </span>
  );
}
