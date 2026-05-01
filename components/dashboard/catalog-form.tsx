'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createCatalogAction, updateCatalogAction } from '@/lib/actions/catalog';

type CreateMode = { mode: 'create' };
type EditMode = {
  mode: 'edit';
  catalogId: string;
  defaults: {
    title: string;
    description: string | null;
    releaseAt: Date | null;
    closesAt: Date | null;
  };
};

function toDatetimeLocal(d: Date | null): string {
  if (!d) return '';
  // YYYY-MM-DDTHH:mm — strip seconds/ms for the input
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CatalogForm(props: CreateMode | EditMode) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function fieldError(name: string): string | undefined {
    return fieldErrors[name]?.[0];
  }

  return (
    <form
      noValidate
      className="space-y-4"
      action={(formData) => {
        setError(null);
        setFieldErrors({});
        startTransition(async () => {
          const result =
            props.mode === 'create'
              ? await createCatalogAction(formData)
              : await updateCatalogAction(props.catalogId, formData);
          if (!result.ok) {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="catalog-title">Catalog title</Label>
        <Input
          id="catalog-title"
          name="title"
          defaultValue={props.mode === 'edit' ? props.defaults.title : ''}
          required
          minLength={2}
          maxLength={120}
          aria-invalid={fieldError('title') ? true : undefined}
        />
        {fieldError('title') && <p className="text-destructive text-xs">{fieldError('title')}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="catalog-description">Description</Label>
        <Textarea
          id="catalog-description"
          name="description"
          rows={3}
          defaultValue={props.mode === 'edit' ? (props.defaults.description ?? '') : ''}
          placeholder="What this collection or drop is about."
          aria-invalid={fieldError('description') ? true : undefined}
        />
        {fieldError('description') && (
          <p className="text-destructive text-xs">{fieldError('description')}</p>
        )}
      </div>
      {props.mode === 'edit' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="catalog-release">Release at (optional)</Label>
            <Input
              id="catalog-release"
              name="releaseAt"
              type="datetime-local"
              defaultValue={toDatetimeLocal(props.defaults.releaseAt)}
              aria-invalid={fieldError('releaseAt') ? true : undefined}
            />
            {fieldError('releaseAt') && (
              <p className="text-destructive text-xs">{fieldError('releaseAt')}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="catalog-closes">Closes at (optional)</Label>
            <Input
              id="catalog-closes"
              name="closesAt"
              type="datetime-local"
              defaultValue={toDatetimeLocal(props.defaults.closesAt)}
              aria-invalid={fieldError('closesAt') ? true : undefined}
            />
            {fieldError('closesAt') && (
              <p className="text-destructive text-xs">{fieldError('closesAt')}</p>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : props.mode === 'create' ? 'Create catalog' : 'Save changes'}
      </Button>
    </form>
  );
}
