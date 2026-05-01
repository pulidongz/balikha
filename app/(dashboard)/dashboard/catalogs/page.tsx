import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogForm } from '@/components/dashboard/catalog-form';
import { EmptyState } from '@/components/marketplace/empty-state';

export const metadata = {
  title: 'Catalogs · Balikha',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'outline',
  published: 'default',
  archived: 'secondary',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

export default async function CatalogsPage() {
  const profile = await requireSellerProfile();

  const list = await db
    .select()
    .from(catalogs)
    .where(eq(catalogs.artisanProfileId, profile.id))
    .orderBy(desc(catalogs.createdAt));

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="font-serif text-3xl tracking-tight">Catalogs</h1>
        <p className="text-muted-foreground">Group your work into collections or limited drops.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">New catalog</CardTitle>
          <CardDescription>The URL slug is generated from the title.</CardDescription>
        </CardHeader>
        <CardContent>
          <CatalogForm mode="create" />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl tracking-tight">Your catalogs</h2>
        {list.length === 0 ? (
          <EmptyState
            title="No catalogs yet"
            description="Use the form above to start your first collection."
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {list.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/catalogs/${c.slug}`}
                  className="hover:bg-secondary/50 block p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="font-serif text-lg leading-tight">{c.title}</h3>
                      <p className="text-muted-foreground text-xs">/{c.slug}</p>
                      {c.description && (
                        <p className="text-foreground/80 mt-2 text-sm">{c.description}</p>
                      )}
                    </div>
                    <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'}>
                      {STATUS_LABEL[c.status]}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
