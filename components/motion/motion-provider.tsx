'use client';
import { LazyMotion, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';

/** Loads Motion's DOM animation feature set once, lazily. Primitives use `m`;
 *  `strict` throws if any `motion.*` slips in. Children render on the server. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
