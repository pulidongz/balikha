import Link from 'next/link';
import { count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, feedback, user } from '@/db/schema';
import { requireAdmin } from '@/lib/auth-helpers';
import { FeedbackActions } from '@/components/admin/feedback-actions';
import { parsePageParam } from '@/lib/queries/admin-params';

export const metadata = {
  title: 'Feedback — Admin',
};

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const PAGE_SIZE = 50;

// Category labels for display in the admin queue. `satisfies` keys this to the
// feedbackCategory enum so a future enum value fails the build here rather than
// silently rendering a raw DB string via a fallback.
const CATEGORY_LABEL = {
  bug: 'Bug',
  idea: 'Idea',
  confusing: 'Confusing',
  other: 'Other',
} satisfies Record<'bug' | 'idea' | 'confusing' | 'other', string>;

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const offset = (page - 1) * PAGE_SIZE;

  const [items, totalRow] = await Promise.all([
    db
      .select({
        id: feedback.id,
        category: feedback.category,
        message: feedback.message,
        route: feedback.route,
        createdAt: feedback.createdAt,
        submitterName: user.name,
        submitterEmail: user.email,
        // leftJoin: buyers have no artisan profile; inner join would drop them.
        shopSlug: artisanProfiles.shopSlug,
      })
      .from(feedback)
      .innerJoin(user, eq(user.id, feedback.userId))
      .leftJoin(artisanProfiles, eq(artisanProfiles.userId, user.id))
      .where(isNull(feedback.resolvedAt))
      .orderBy(desc(feedback.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ value: count() }).from(feedback).where(isNull(feedback.resolvedAt)),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    return p <= 1 ? '/admin/feedback' : `/admin/feedback?page=${p}`;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Feedback</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {total === 0
            ? 'No new feedback.'
            : `${total} new feedback ${total === 1 ? 'item' : 'items'}${
                totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''
              }.`}
        </p>
      </header>

      {items.length > 0 && (
        <ul className="space-y-4">
          {items.map((r) => (
            <li key={r.id} className="space-y-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="bg-secondary rounded-full px-2 py-0.5 text-xs font-medium">
                      {CATEGORY_LABEL[r.category]}
                    </span>
                    {r.shopSlug !== null && (
                      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                        Seller
                      </span>
                    )}
                  </p>
                  <p>
                    <span className="font-medium">{r.submitterName}</span>{' '}
                    <span className="text-muted-foreground">({r.submitterEmail})</span>
                  </p>
                  {r.route && (
                    <p className="text-muted-foreground text-xs">from {r.route}</p>
                  )}
                  <p className="text-muted-foreground text-xs">{DATE_FMT.format(r.createdAt)}</p>
                </div>
                <FeedbackActions feedbackId={r.id} />
              </div>
              <blockquote className="bg-secondary/50 whitespace-pre-line rounded-md p-3 text-sm">
                {r.message}
              </blockquote>
            </li>
          ))}
        </ul>
      )}

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
