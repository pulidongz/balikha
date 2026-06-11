'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createStudioUpdateAction } from '@/lib/actions/studio-updates';

// One-form composer (T9 AC: publishable from a phone in under a minute):
// pick photos, optionally say something, post. No dialog, no steps.
export function UpdateComposer() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createStudioUpdateAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setPhotoCount(0);
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border p-4"
      aria-label="Post an update"
    >
      <p className="font-medium">Share an update</p>
      <Textarea
        name="body"
        rows={2}
        maxLength={1000}
        placeholder="Kiln opening, work in progress, a good day at the wheel…"
      />
      <input
        type="file"
        name="photos"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => setPhotoCount(e.currentTarget.files?.length ?? 0)}
        className="text-muted-foreground file:bg-secondary file:text-foreground block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2"
      />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {photoCount === 0
            ? 'Add 1–4 photos'
            : `${photoCount} photo${photoCount === 1 ? '' : 's'}`}
        </span>
        <Button type="submit" disabled={isPending || photoCount === 0 || photoCount > 4}>
          {isPending ? 'Posting…' : 'Post update'}
        </Button>
      </div>
    </form>
  );
}
