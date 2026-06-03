'use client';

import { useRouter } from 'next/navigation';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { approveSellerApplication, rejectSellerApplication } from '@/lib/actions/sellers';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// Renders the available transitions based on the profile's current status
// (Decision #4 re-open, Decision #7 applicant-facing note):
//   pending  → Approve + Reject
//   rejected → Approve (re-open to approved)
//   approved → Reject (revoke)
export function AdminSellerActions({
  artisanProfileId,
  approvalStatus,
}: {
  artisanProfileId: string;
  approvalStatus: ApprovalStatus;
}) {
  if (approvalStatus === 'pending') {
    return (
      <div className="flex flex-wrap gap-2">
        <ApproveButton artisanProfileId={artisanProfileId} />
        <RejectButton artisanProfileId={artisanProfileId} />
      </div>
    );
  }
  if (approvalStatus === 'rejected') {
    return (
      <div className="flex flex-wrap gap-2">
        <ApproveButton artisanProfileId={artisanProfileId} label="Re-open (approve)" />
      </div>
    );
  }
  if (approvalStatus === 'approved') {
    return (
      <div className="flex flex-wrap gap-2">
        <RejectButton artisanProfileId={artisanProfileId} label="Revoke (reject)" />
      </div>
    );
  }
  return null;
}

function ApproveButton({
  artisanProfileId,
  label = 'Approve',
}: {
  artisanProfileId: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveSellerApplication({ artisanProfileId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleApprove} disabled={pending}>
        {pending ? 'Approving…' : label}
      </Button>
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function RejectButton({
  artisanProfileId,
  label = 'Reject',
}: {
  artisanProfileId: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await rejectSellerApplication({
        artisanProfileId,
        note: note.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Reject seller application</DialogTitle>
              <DialogDescription>
                The application will be marked as rejected. You can re-open it later by approving.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="rejection-note">Reason shown to the applicant</Label>
              <Textarea
                id="rejection-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional — explain why the application was not approved. This note is shown directly to the applicant on their dashboard and in the rejection email."
                maxLength={2000}
                rows={4}
                autoFocus
              />
              <p className="text-muted-foreground text-xs">
                {note.trim().length > 0
                  ? `${note.trim().length} / 2000 characters`
                  : 'Optional but recommended.'}
              </p>
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
                Back
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? 'Rejecting…' : label}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
