'use client';

import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { deleteAvatarAction, uploadAvatarAction } from '@/lib/actions/profile';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

interface Props {
  currentUrl: string | null;
  userName: string;
}

export function AvatarUploader({ currentUrl, userName }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    setError(null);
    if (!confirm('Remove the current avatar?')) return;
    startTransition(async () => {
      const result = await deleteAvatarAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {currentUrl ? (
          <div className="bg-secondary relative h-20 w-20 overflow-hidden rounded-full border">
            <Image
              src={currentUrl}
              alt={`${userName} avatar`}
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>
        ) : (
          <Avatar className="h-20 w-20">
            <AvatarFallback className="text-lg">{initialsOf(userName)}</AvatarFallback>
          </Avatar>
        )}
        {currentUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isPending}
          >
            Remove
          </Button>
        )}
      </div>

      <form
        ref={formRef}
        noValidate
        className="space-y-2"
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const result = await uploadAvatarAction(formData);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            formRef.current?.reset();
            router.refresh();
          });
        }}
      >
        <Label htmlFor="avatar-file" className="text-muted-foreground text-xs">
          Upload a new photo (PNG, JPEG or WebP, ≤ 4 MB)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="avatar-file"
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={isPending}
            required
            className="max-w-sm"
          />
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
