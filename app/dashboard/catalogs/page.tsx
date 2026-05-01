import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs } from '@/db/schema';
import { requireSellerProfile } from '@/lib/auth-helpers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogForm } from '@/components/dashboard/catalog-form';

export const metadata = {
  title: 'Catalogs · Balikha',
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
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm">
          <Link href="/dashboard" className="hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Catalogs</h1>
        <p className="text-muted-foreground text-sm">
          Group your work into collections or limited drops.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New catalog</CardTitle>
          <CardDescription>The URL slug is generated from the title.</CardDescription>
        </CardHeader>
        <CardContent>
          <CatalogForm mode="create" />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Your catalogs</h2>
        {list.length === 0 ? (
          <p className="text-muted-foreground text-sm">No catalogs yet.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((c) => (
              <li key={c.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium">
                      <Link href={`/dashboard/catalogs/${c.slug}`} className="hover:underline">
                        {c.title}
                      </Link>
                    </h3>
                    <p className="text-muted-foreground text-xs">/{c.slug}</p>
                    {c.description && <p className="mt-2 text-sm">{c.description}</p>}
                  </div>
                  <span className="text-muted-foreground rounded border px-2 py-0.5 text-xs">
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
