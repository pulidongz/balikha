'use client';
import { m, useReducedMotion, type Variants } from 'motion/react';
import { useSyncExternalStore, type ReactNode } from 'react';

const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.23, 1, 0.32, 1] } },
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

/** Grid container (<ul>). Staggers its <StaggerGridItem> children. */
export function StaggerGrid({
  children,
  className,
  gap = 0.09,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const mounted = useMounted();

  if (!mounted || prefersReducedMotion) return <ul className={className}>{children}</ul>;
  return (
    <m.ul
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      variants={{ show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </m.ul>
  );
}

/** Grid item (<li>). Soft quart settle — no per-card bounce. */
export function StaggerGridItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const mounted = useMounted();

  if (!mounted || prefersReducedMotion) return <li className={className}>{children}</li>;
  return (
    <m.li className={className} variants={ITEM_VARIANTS}>
      {children}
    </m.li>
  );
}
