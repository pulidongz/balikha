import { cn } from '@/lib/utils';

// Thin-stroke status marks for the auth status surfaces (verify-email, the
// forgot/reset confirmations). Hairline and monochrome per DESIGN.md — a calm
// anchor, never a filled rounded-icon chip. Decorative: the heading carries the
// meaning, so the mark is aria-hidden.
type AuthMarkVariant = 'mail' | 'success' | 'alert';

const VARIANT_COLOR: Record<AuthMarkVariant, string> = {
  mail: 'text-foreground',
  success: 'text-success',
  alert: 'text-muted-foreground',
};

export function AuthMark({ variant, className }: { variant: AuthMarkVariant; className?: string }) {
  return (
    <span className={cn('inline-flex', VARIANT_COLOR[variant], className)} aria-hidden="true">
      <svg
        width="40"
        height="40"
        viewBox="0 0 36 36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {variant === 'mail' && (
          <>
            <rect x="4" y="8" width="28" height="20" rx="2.5" />
            <path d="M5 11l13 8.5L31 11" />
          </>
        )}
        {variant === 'success' && (
          <>
            <circle cx="18" cy="18" r="13.5" />
            <path d="M11.5 18.5l4.5 4.5 8.5-9.5" />
          </>
        )}
        {variant === 'alert' && (
          <>
            <circle cx="18" cy="18" r="13.5" />
            <path d="M18 11.5v7.5" />
            <path d="M18 24.4v.1" />
          </>
        )}
      </svg>
    </span>
  );
}
