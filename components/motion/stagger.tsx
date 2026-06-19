'use client';
import { m, useInView, useReducedMotion, type Variants } from 'motion/react';
import { useRef, type ReactNode } from 'react';
import { useMounted } from '@/components/motion/use-mounted';

const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.23, 1, 0.32, 1] } },
};

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
  const ref = useRef<HTMLUListElement>(null);
  // Drive `animate` from a useInView flag, not the `whileInView` gesture: the
  // gesture leaves children added AFTER it fires (cursor pagination swaps in
  // new items while the grid instance persists) stranded at opacity 0. A
  // controlled target re-applies "show" to newly-mounted children. once:true =
  // no replay on scroll-back.
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });

  if (!mounted || prefersReducedMotion) return <ul className={className}>{children}</ul>;
  return (
    <m.ul
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
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
