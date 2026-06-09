import Link from 'next/link';
import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, products } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AdminProductActions } from '@/components/admin/admin-product-actions';

export const metadata = {
  title: 'Products — Admin',
};

const PAGE_SIZE = 50;

type ProductFilter = 'all' | 'live' | 'flagged' | 'removed';

function parseFilter(raw: string | string[] | undefined): ProductFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  switch (value) {
    case 'all':
    case 'live':
    case 'flagged':
    case 'removed':
      return value;
    default:
      return 'all';
  }
}

function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseSearch(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim() : '';
}

const TABS: readonly { value: ProductFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'removed', label: 'Removed' },
];

const MODERATION_BADGE: Record<string, string> = {
  flagged: 'bg-amber-100 text-amber-800',
  removed: 'bg-red-100 text-red-700',
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    filter?: string | string[];
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const search = parseSearch(params.q);
  const page = parsePage(params.page);
  const filter = parseFilter(params.filter);
  const offset = (page - 1) * PAGE_SIZE;

  const whereClauses: SQL[] = [];

  if (search.length > 0) {
    whereClauses.push(ilike(products.title, `%${search}%`));
  }

  switch (filter) {
    case 'all':
      break;
    case 'live':
      whereClauses.push(eq(products.status, 'published'));
      break;
    case 'flagged':
      whereClauses.push(eq(products.moderationStatus, 'flagged'));
      break;
    case 'removed':
      whereClauses.push(eq(products.moderationStatus, 'removed'));
      break;
  }

  const whereExpr = whereClauses.length > 0 ? and(...whereClauses) : undefined;

  const [list, totalRow] = await Promise.all([
    db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        status: products.status,
        moderationStatus: products.moderationStatus,
        createdAt: products.createdAt,
        shopName: artisanProfiles.shopName,
        artisanSlug: artisanProfiles.shopSlug,
      })
      .from(products)
      .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
      .where(whereExpr)
      .orderBy(desc(products.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ value: count() })
      .from(products)
      .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
      .where(whereExpr),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (search) sp.set('q', search);
    if (filter !== 'all') sp.set('filter', filter);
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    return `/admin/products${qs ? `?${qs}` : ''}`;
  }

  function filterHref(f: ProductFilter) {
    const sp = new URLSearchParams();
    if (search) sp.set('q', search);
    if (f !== 'all') sp.set('filter', f);
    const qs = sp.toString();
    return `/admin/products${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl tracking-tight">Products</h1>
        <p className="text-muted-foreground text-sm">
          Review listings. Flag for attention or remove policy-violating products.
        </p>
      </header>

      {/* Filter tabs */}
      <nav aria-label="Product filters" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 border-b">
          {TABS.map((tab) => {
            const active = filter === tab.value;
            return (
              <li key={tab.value}>
                <Link
                  href={filterHref(tab.value)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors',
                    active
                      ? 'text-foreground border-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground border-transparent',
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Search */}
      <form method="get" action="/admin/products" className="flex gap-2">
        {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search by title…"
          className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
        >
          Search
        </button>
      </form>

      {/* Summary */}
      <p className="text-muted-foreground text-xs">
        {total} {total === 1 ? 'product' : 'products'}
        {search ? ` matching "${search}"` : ''}
        {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
      </p>

      {list.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          No products found{search ? ` for "${search}"` : ''}.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((product) => (
            <li key={product.id}>
              <div className="bg-card flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start sm:gap-6">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-foreground font-medium">{product.title}</p>
                  <p className="text-muted-foreground text-xs">{product.shopName ?? '—'}</p>
                  <p className="text-muted-foreground text-xs">
                    Added {formatRelativeTime(product.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                    {product.status}
                  </span>
                  {product.moderationStatus !== 'none' && (
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium',
                        MODERATION_BADGE[product.moderationStatus] ??
                          'bg-muted text-muted-foreground',
                      )}
                    >
                      {product.moderationStatus}
                    </span>
                  )}
                  {product.artisanSlug && product.slug && (
                    <a
                      href={`/shop/${product.artisanSlug}/${product.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                    >
                      View listing ↗
                    </a>
                  )}
                </div>
                <div className="shrink-0">
                  <AdminProductActions
                    productId={product.id}
                    moderationStatus={product.moderationStatus}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-2 pt-2">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground text-xs">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
