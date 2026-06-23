'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { useMounted } from '@/components/motion/use-mounted';
import { cn } from '@/lib/utils';

const SLIDE_MS = 6000;
// ease-quart, matching the design system's --ease-quart token.
const EASE_QUART: [number, number, number, number] = [0.23, 1, 0.32, 1];

// Crossfade slideshow for the auth panel: the multiple photos of one product.
// Honors prefers-reduced-motion (static primary image), pauses on hover/focus,
// and exposes focusable dot controls (WCAG SC 2.2.2 pause/jump, 2.4.7 focus
// ring, 2.5.8 24px target). A single image renders as a plain static photo.
export function AuthSlideshow({
  images,
  alt,
  sizes,
}: {
  images: string[];
  alt: string;
  sizes?: string;
}) {
  // Same SSR-safe gate the repo standardizes on (components/motion/reveal.tsx):
  // server + first client render see mounted=false → static primary image; then
  // React re-renders mounted=true → slideshow. No hydration mismatch, and the
  // autoplay interval never starts before reduced-motion resolves.
  const mounted = useMounted();
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const animate = mounted && !prefersReducedMotion && images.length > 1;

  useEffect(() => {
    if (!animate || paused) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, SLIDE_MS);
    return () => clearInterval(id);
  }, [animate, paused, images.length]);

  const first = images[0];
  if (!first) return null;

  // Pre-mount, reduced motion, or a single image: a plain static photo at full
  // opacity (no reveal-gate), no chrome.
  if (!animate) {
    return (
      <Image src={first} alt={alt} fill sizes={sizes} className="auth-panel-drift object-cover" />
    );
  }

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {images.map((src, i) => (
        <m.div
          key={src}
          // opacity:0 slides must not intercept clicks meant for the caption
          // link beneath them — make click-through deterministic.
          className={cn('absolute inset-0', i !== index && 'pointer-events-none')}
          initial={false}
          animate={{ opacity: i === index ? 1 : 0 }}
          transition={{ duration: 0.7, ease: EASE_QUART }}
        >
          <Image
            src={src}
            alt={i === index ? alt : ''}
            fill
            sizes={sizes}
            className="object-cover"
          />
        </m.div>
      ))}
      <div
        className="absolute top-6 right-6 z-10 flex gap-1"
        role="group"
        aria-label="Choose featured photo"
      >
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show photo ${i + 1} of ${images.length}`}
            aria-current={i === index}
            // 24px hit target (SC 2.5.8) around an 8px visual dot, with a visible
            // focus ring (SC 2.4.7) tuned for the navy panel.
            className="group focus-visible:ring-primary-foreground focus-visible:ring-offset-primary grid size-6 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <span
              className={cn(
                'size-2 rounded-full transition-colors',
                i === index
                  ? 'bg-primary-foreground'
                  : 'bg-primary-foreground/40 group-hover:bg-primary-foreground/70',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
