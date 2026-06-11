import { Skeleton } from '@/components/ui/skeleton';

// Admin skeleton (E2): heading + stat row + panel grid, matching the
// overview and list pages.
export default function AdminLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
