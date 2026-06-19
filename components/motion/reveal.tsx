'use client';

import { m, useReducedMotion } from 'motion/react';
import { useSyncExternalStore, type ReactNode } from 'react';

/** Block-level scroll reveal. Children pass through from Server Components.
 *  Variants: section (24px + overshoot, accents only), soft (24px quart,
 *  default for sections), subtle (12px quart, product register).
 *  Do NOT wrap above-the-fold critical content. Honors reduced motion. */
type RevealVariant = 'section' | 'soft' | 'subtle';

const RISE: Record<RevealVariant, number> = { section: 24, soft: 24, subtle: 12 };
const EASE: Record<RevealVariant, [number, number, number, number]> = {
  section: [0.34, 1.3, 0.64, 1],
  soft: [0.23, 1, 0.32, 1],
  subtle: [0.23, 1, 0.32, 1],
};

// useSyncExternalStore-based hydration gate: server snapshot returns false,
// client snapshot returns true. SSR and the first client render agree (both
// see false → plain element), then React re-renders with true → animated
// element. No useEffect + setState, no hydration mismatch.
function subscribe(): () => void {
  return () => {};
}
function getSnapshot(): boolean {
  return true;
}
function getServerSnapshot(): boolean {
  return false;
}
function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function Reveal({
  children,
  variant = 'soft',
  delay = 0,
  className,
}: {
  children: ReactNode;
  variant?: RevealVariant;
  delay?: number;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const mounted = useMounted();

  if (!mounted || prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: RISE[variant] }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.6, ease: EASE[variant], delay }}
    >
      {children}
    </m.div>
  );
}
