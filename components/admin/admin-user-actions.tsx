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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  banUser,
  demoteToUser,
  promoteToAdmin,
  suspendUser,
  unbanUser,
  unsuspendUser,
} from '@/lib/actions/users';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserStatus = 'active' | 'suspended' | 'banned';

// ---------------------------------------------------------------------------
// Main island
// ---------------------------------------------------------------------------
// Renders the available transitions based on the user's current status + role.
// No Impersonate button (Decision 7).
// ---------------------------------------------------------------------------

export function AdminUserActions({
  userId,
  status,
  role,
}: {
  userId: string;
  status: UserStatus;
  role: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === 'active' && (
        <>
          <SuspendButton userId={userId} />
          <BanButton userId={userId} />
        </>
      )}
      {status === 'suspended' && <UnsuspendButton userId={userId} />}
      {status === 'banned' && <UnbanButton userId={userId} />}
      {role !== 'admin' && <PromoteButton userId={userId} />}
      {role === 'admin' && <DemoteButton userId={userId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suspend — requires duration (days) + reason
// ---------------------------------------------------------------------------

function SuspendButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const days = Number.parseInt(durationDays, 10);
    if (!Number.isFinite(days) || days < 1) {
      setError('Duration must be a positive number of days.');
      return;
    }
    if (!reason.trim()) {
      setError('Reason is required.');
      return;
    }
    startTransition(async () => {
      const result = await suspendUser({ userId, reason: reason.trim(), durationDays: days });
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
      <Button variant="outline" onClick={() => setOpen(true)}>
        Suspend
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Suspend user</DialogTitle>
              <DialogDescription>
                The user will be blocked from signing in and all mutating actions for the duration.
                Their listings will be hidden until unsuspended.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="suspend-duration">Duration (days)</Label>
                <Input
                  id="suspend-duration"
                  type="number"
                  min={1}
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="suspend-reason">Reason (internal)</Label>
                <Textarea
                  id="suspend-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required — recorded in the audit log."
                  rows={3}
                  maxLength={2000}
                />
              </div>
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
                {pending ? 'Suspending…' : 'Suspend'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Unsuspend — no dialog needed
// ---------------------------------------------------------------------------

function UnsuspendButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await unsuspendUser({ userId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={handleClick} disabled={pending}>
        {pending ? 'Unsuspending…' : 'Unsuspend'}
      </Button>
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ban — requires reason
// ---------------------------------------------------------------------------

function BanButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError('Reason is required.');
      return;
    }
    startTransition(async () => {
      const result = await banUser({ userId, reason: reason.trim() });
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
        Ban
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Ban user</DialogTitle>
              <DialogDescription>
                Permanently blocks the user from signing in. Their listings will be hidden. This
                action can be reversed via Unban.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="ban-reason">Reason (internal)</Label>
              <Textarea
                id="ban-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required — recorded in the audit log."
                rows={3}
                maxLength={2000}
                autoFocus
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
                {pending ? 'Banning…' : 'Ban'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Unban — no dialog needed
// ---------------------------------------------------------------------------

function UnbanButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await unbanUser({ userId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={handleClick} disabled={pending}>
        {pending ? 'Unbanning…' : 'Unban'}
      </Button>
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Promote to admin
// ---------------------------------------------------------------------------

function PromoteButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await promoteToAdmin({ userId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={handleClick} disabled={pending}>
        {pending ? 'Promoting…' : 'Promote to admin'}
      </Button>
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demote to user
// ---------------------------------------------------------------------------

function DemoteButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await demoteToUser({ userId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={handleClick} disabled={pending}>
        {pending ? 'Demoting…' : 'Demote to user'}
      </Button>
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
