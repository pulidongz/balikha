import { Children, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { StaggerGrid, StaggerGridItem } from '@/components/motion/stagger';

type Cols = 3 | 4;
const COL_CLASS: Record<Cols, string> = {
  // Mobile two-up minimum per plan §3 ("two columns on mobile is the minimum")
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
};

/** Owns the <li> (or animated <li>) wrapping. Callers pass card nodes with a
 *  `key` — NOT <li> wrappers. `stagger` cascades the cards into view. */
export function ProductGrid({
  cols = 4,
  children,
  className,
  stagger = false,
}: {
  cols?: Cols;
  children: ReactNode;
  className?: string;
  stagger?: boolean;
}) {
  const gridClass = cn('grid gap-x-5 gap-y-8', COL_CLASS[cols], className);
  const items = Children.toArray(children);
  if (stagger) {
    return (
      <StaggerGrid className={gridClass}>
        {items.map((child) => (
          <StaggerGridItem key={(child as { key?: string }).key ?? undefined}>
            {child}
          </StaggerGridItem>
        ))}
      </StaggerGrid>
    );
  }
  return (
    <ul className={gridClass}>
      {items.map((child) => (
        <li key={(child as { key?: string }).key ?? undefined}>{child}</li>
      ))}
    </ul>
  );
}
