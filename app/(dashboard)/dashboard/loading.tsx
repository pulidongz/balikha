import { Skeleton } from '@/components/ui/skeleton';

// Dashboard skeleton (E2): heading + card column, the shape of most
// dashboard pages.
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
