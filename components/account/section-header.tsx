import Link from 'next/link';

// Section header used by every preview block on the /account landing.
// "View all →" is suppressed when the section has nothing to view —
// pointing the buyer at an empty dedicated page is worse UX than just
// hiding the link.
export function SectionHeader({
  title,
  viewAllHref,
  showViewAll,
}: {
  title: string;
  viewAllHref: string;
  showViewAll: boolean;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="font-serif text-xl tracking-tight">{title}</h2>
      {showViewAll && (
        <Link
          href={viewAllHref}
          className="text-muted-foreground hover:text-foreground text-sm whitespace-nowrap"
        >
          View all →
        </Link>
      )}
    </div>
  );
}
