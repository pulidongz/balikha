import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl font-serif font-medium',
};

// Per balikha-frontend-plan.md §3: --accent (Philippine red) is for prices.
export function PriceTag({
  price,
  currency,
  size = 'md',
  compareAt = null,
  className,
}: {
  price: string;
  currency: string;
  size?: Size;
  compareAt?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn('text-accent inline-flex items-baseline gap-2', SIZE_CLASS[size], className)}
    >
      {formatPrice(price, currency)}
      {compareAt && (
        <span className="text-muted-foreground text-sm font-normal line-through decoration-from-font">
          {formatPrice(compareAt, currency)}
        </span>
      )}
    </span>
  );
}
