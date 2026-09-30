import type { SVGProps } from 'react';
import {
  LOCKUP_HEIGHT,
  LOCKUP_SYMBOL_TRANSFORM,
  LOCKUP_VIEWBOX,
  LOCKUP_WIDTH,
  LOCKUP_WORDMARK_PATH,
  SYMBOL_PATH,
} from './logo-paths';

type LogoProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'>;

// The horizontal Coil lockup: the symbol beside the outlined wordmark. It
// paints with currentColor so it takes the surrounding text colour; pass
// `fill` where there is no CSS colour to inherit (ImageResponse). Keep it at
// least 32px tall: below that the coil's turns start to merge.
export function Logo(props: LogoProps) {
  return (
    <svg viewBox={LOCKUP_VIEWBOX} role="img" aria-label="Balikha" fill="currentColor" {...props}>
      <path transform={LOCKUP_SYMBOL_TRANSFORM} d={SYMBOL_PATH} />
      <path d={LOCKUP_WORDMARK_PATH} />
    </svg>
  );
}

export function lockupWidth(height: number): number {
  return Math.round((height * LOCKUP_WIDTH) / LOCKUP_HEIGHT);
}
