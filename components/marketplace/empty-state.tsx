import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-secondary/30 rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <p className="text-foreground font-serif text-xl">{title}</p>
      {description && (
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">{description}</p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
