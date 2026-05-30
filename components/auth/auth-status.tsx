import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AuthMark } from '@/components/auth/auth-mark';

// Shared centered status layout for the auth surfaces (verify-email states, the
// forgot/reset confirmations and dead-ends). Keeps all six states visually
// identical: a thin-stroke mark, a Fraunces title, optional vermilion tick for
// the one celebratory moment, a constrained-measure description, then an action
// and a quiet footer link. Entrance motion is staggered via the auth-* classes.
interface AuthStatusProps {
  mark: 'mail' | 'success' | 'alert';
  title: string;
  description: ReactNode;
  // The verified moment: draws the check in and reveals the vermilion tick.
  celebrate?: boolean;
  // Larger Fraunces headline for the celebratory state.
  large?: boolean;
  action?: ReactNode;
  footer?: ReactNode;
}

export function AuthStatus({
  mark,
  title,
  description,
  celebrate = false,
  large = false,
  action,
  footer,
}: AuthStatusProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <AuthMark variant={mark} className={cn('auth-rise', celebrate && 'auth-check')} />
      <h1
        className={cn(
          'auth-rise mt-5 font-serif tracking-tight',
          large ? 'text-3xl leading-tight' : 'text-2xl',
        )}
        style={{ animationDelay: '90ms' }}
      >
        {title}
      </h1>
      {celebrate ? (
        <div className="bg-accent auth-tick mt-3 h-[3px] w-8 rounded-full" aria-hidden />
      ) : null}
      <div
        className="text-muted-foreground auth-rise mt-3 max-w-[36ch] text-sm leading-relaxed"
        style={{ animationDelay: '90ms' }}
      >
        {description}
      </div>
      {action ? (
        <div className="auth-rise mt-7 w-full" style={{ animationDelay: '180ms' }}>
          {action}
        </div>
      ) : null}
      {footer ? (
        <div
          className="text-muted-foreground auth-rise mt-5 text-sm leading-relaxed"
          style={{ animationDelay: '230ms' }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
