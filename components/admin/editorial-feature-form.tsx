'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateEditorialFeatureAction } from '@/lib/actions/editorial-feature';

// Mirror of MAX_FEATURED_WORKS in lib/actions/editorial-feature.ts. The server
// action is the source of truth and re-validates; this just gates the UI.
const MAX_FEATURED_WORKS = 8;

interface StudioOption {
  id: string;
  name: string;
  slug: string;
}

interface WorkOption {
  id: string;
  title: string;
  slug: string;
  studioSlug: string;
}

interface Props {
  studios: StudioOption[];
  works: WorkOption[];
  defaults: {
    studioSlug: string;
    editorialText: string;
    workIds: string[];
  };
}

export function EditorialFeatureForm({ studios, works, defaults }: Props) {
  const router = useRouter();
  const [studioSlug, setStudioSlug] = useState(defaults.studioSlug);
  const [editorialText, setEditorialText] = useState(defaults.editorialText);
  // Ordered list of selected work ids — the order IS the homepage order.
  const [selectedWorkIds, setSelectedWorkIds] = useState<string[]>(defaults.workIds);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const studioWorks = works.filter((w) => w.studioSlug === studioSlug);
  const worksById = new Map(works.map((w) => [w.id, w]));

  function changeStudio(slug: string) {
    setStudioSlug(slug);
    // Works are scoped to the studio — switching studios clears the selection.
    setSelectedWorkIds([]);
    setSaved(false);
  }

  function toggleWork(id: string) {
    setSaved(false);
    setSelectedWorkIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_FEATURED_WORKS) return prev; // cap reached — no-op
      return [...prev, id];
    });
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    // Assemble the slug payload the server action still expects ("studio/work"
    // per line, in selection order). The action re-validates every slug.
    const workSlugs = selectedWorkIds
      .map((id) => worksById.get(id))
      .filter((w): w is WorkOption => w !== undefined)
      .map((w) => `${w.studioSlug}/${w.slug}`)
      .join('\n');
    startTransition(async () => {
      const result = await updateEditorialFeatureAction({
        artisanSlug: studioSlug,
        editorialText,
        workSlugs,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="feature-studio">Featured studio</Label>
        <select
          id="feature-studio"
          value={studioSlug}
          onChange={(e) => changeStudio(e.target.value)}
          className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
        >
          <option value="">— None (clear the feature) —</option>
          {studios.map((s) => (
            <option key={s.id} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          One studio leads the homepage. Choose “None” to clear the feature.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feature-text">Editorial text</Label>
        <Textarea
          id="feature-text"
          value={editorialText}
          onChange={(e) => {
            setEditorialText(e.target.value);
            setSaved(false);
          }}
          rows={4}
          maxLength={1000}
          placeholder="Why this studio, in your own words — it reads like a magazine deck, not ad copy."
        />
      </div>

      <div className="space-y-2">
        <Label>
          Featured works{' '}
          <span className="text-muted-foreground font-normal">
            ({selectedWorkIds.length}/{MAX_FEATURED_WORKS})
          </span>
        </Label>
        {studioSlug === '' ? (
          <p className="text-muted-foreground text-sm">Select a studio to choose works.</p>
        ) : studioWorks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This studio has no published works to feature yet.
          </p>
        ) : (
          <ul className="divide-border divide-y rounded-md border">
            {studioWorks.map((w) => {
              const order = selectedWorkIds.indexOf(w.id);
              const checked = order !== -1;
              const atCap = !checked && selectedWorkIds.length >= MAX_FEATURED_WORKS;
              return (
                <li key={w.id}>
                  <label
                    className={
                      'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ' +
                      (atCap ? 'opacity-50' : 'hover:bg-secondary/40')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() => toggleWork(w.id)}
                      className="size-4"
                    />
                    <span className="flex-1 truncate">{w.title}</span>
                    {checked && (
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        #{order + 1}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-muted-foreground text-xs">
          Up to {MAX_FEATURED_WORKS}. The number shows the order on the homepage (selection order).
        </p>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {saved && <p className="text-sm text-green-700">Saved — the homepage is updated.</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save feature'}
      </Button>
    </form>
  );
}
