import { formatRelativeTime } from '@/lib/format';

// Absolute timestamp for the hover tooltip — admins doing forensics need the
// real date, not just "3 days ago".
const ABSOLUTE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Renders relative time with the absolute date in the title tooltip + a machine
// dateTime. Server component — used across the admin list pages so the relative
// label and the tooltip never drift.
export function RelativeTime({ date, className }: { date: Date; className?: string }) {
  return (
    <time dateTime={date.toISOString()} title={ABSOLUTE_FMT.format(date)} className={className}>
      {formatRelativeTime(date)}
    </time>
  );
}
