import Link from 'next/link';

// Empty state for sections inside the /account landing. Distinct from
// `<EmptyState />` (used on dedicated pages, takes up more vertical
// space): this one is small enough that you can comfortably stack four
// of them on one page without the layout collapsing into emptiness.
export function EmptyInline({
  message,
  ctaHref,
  ctaLabel,
}: {
  message: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="bg-card rounded-md border border-dashed p-5 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="text-foreground mt-2 inline-block text-sm font-medium underline-offset-4 hover:underline"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
