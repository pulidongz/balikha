import { Skeleton } from '@/components/ui/skeleton';

// Studio-page skeleton (E2): cover band, identity row, then a work grid —
// the page's real shape, so the loaded state lands without a jolt.
export default function StudioLoading() {
  return (
    <div>
      <Skeleton className="aspect-[16/6] w-full rounded-none md:aspect-[16/4]" />
      <div className="mx-auto mt-8 max-w-5xl px-4 sm:px-6">
        <div className="flex items-end gap-6">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <Skeleton className="aspect-square" />
          <Skeleton className="aspect-square" />
          <Skeleton className="aspect-square" />
          <Skeleton className="aspect-square" />
        </div>
      </div>
    </div>
  );
}
