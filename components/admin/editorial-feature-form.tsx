'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateEditorialFeatureAction } from '@/lib/actions/editorial-feature';

interface Props {
  defaults: {
    artisanSlug: string;
    editorialText: string;
    workSlugs: string;
  };
}

export function EditorialFeatureForm({ defaults }: Props) {
  const router = useRouter();
  const [artisanSlug, setArtisanSlug] = useState(defaults.artisanSlug);
  const [editorialText, setEditorialText] = useState(defaults.editorialText);
  const [workSlugs, setWorkSlugs] = useState(defaults.workSlugs);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateEditorialFeatureAction({ artisanSlug, editorialText, workSlugs });
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
        <Label htmlFor="feature-artisan">Featured studio (slug)</Label>
        <Input
          id="feature-artisan"
          value={artisanSlug}
          onChange={(e) => setArtisanSlug(e.target.value)}
          placeholder="maria-ceramics"
        />
        <p className="text-muted-foreground text-xs">
          The part after /studio/ in the studio URL. Leave empty to clear the artist feature.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feature-text">Editorial text</Label>
        <Textarea
          id="feature-text"
          value={editorialText}
          onChange={(e) => setEditorialText(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Why this studio, in your own words — it reads like a magazine deck, not ad copy."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="feature-works">Featured works (one per line)</Label>
        <Textarea
          id="feature-works"
          value={workSlugs}
          onChange={(e) => setWorkSlugs(e.target.value)}
          rows={5}
          placeholder={'maria-ceramics/slab-built-stoneware-vase-1\nanother-studio/another-work'}
        />
        <p className="text-muted-foreground text-xs">
          artisan-slug/work-slug, up to 8 — the order here is the order on the homepage.
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
