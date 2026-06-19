'use client';
import { m, useReducedMotion, type Variants } from 'motion/react';
import { type ReactNode } from 'react';
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
