import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Cols = 3 | 4;

const COL_CLASS: Record<Cols, string> = {
  // Mobile two-up minimum per plan §3 ("two columns on mobile is the minimum")
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
};

export function ProductGrid({
  cols = 4,
  children,
  className,
}: {
  cols?: Cols;
  children: ReactNode;
  className?: string;
}) {
  return <ul className={cn('grid gap-x-5 gap-y-8', COL_CLASS[cols], className)}>{children}</ul>;
}
