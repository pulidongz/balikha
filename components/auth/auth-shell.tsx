'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Photo-panel placement per auth route. Entry pages get the editorial
// panel (sign-in/verify right, sign-up left — alternating gives each its
// own identity); recovery flows (forgot/reset password) drop the panel
// entirely — those are task-critical moments where the component itself
// is the focus, not the gallery. Routes not listed (and any future auth
// page) compose with the panel on the right, the default.
const LEFT_PANEL_ROUTES = ['/sign-up'];
const NO_PANEL_ROUTES = ['/forgot-password', '/reset-password'];

// Client half of the auth layout: the server layout fetches the panel
// media and passes the rendered panel content down; this shell only
// decides where (and whether) it renders — usePathname is client-only —
// and owns the entry motion classes.
export function AuthShell({ panel, children }: { panel: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const noPanel = NO_PANEL_ROUTES.some((route) => pathname.startsWith(route));
  const panelLeft = LEFT_PANEL_ROUTES.some((route) => pathname.startsWith(route));
  return (
    <main className={cn('flex min-h-screen', panelLeft && 'flex-row-reverse')}>
      <div className="bg-background flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="auth-rise flex w-full flex-col items-center">{children}</div>
      </div>
      {/* Featured-artisan panel: a daily piece as a crossfade slideshow with a
          link to its product. Hidden below lg; overflow-hidden clips the photo
          drift/crossfade overscan. The form renders first (above) so it leads
          the DOM/tab order. */}
      {!noPanel && (
        <aside
          aria-label="Featured artisan"
          className="bg-primary relative hidden overflow-hidden lg:block lg:w-[44%]"
        >
          {panel}
        </aside>
      )}
    </main>
  );
}
