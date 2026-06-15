'use client';

import { useState } from 'react';
import { FeedbackDialog } from '@/components/feedback/feedback-dialog';

export function FeedbackFooterLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hover:text-foreground text-left"
      >
        Send feedback
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
