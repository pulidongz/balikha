'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Photo-panel side per auth route — alternating left/right gives each
// page its own identity while the shell stays one shared layout. Routes
// not listed (and any future auth page) compose with the panel on the
// right, the default.
const LEFT_PANEL_ROUTES = ['/sign-up', '/reset-password'];

// Client half of the auth layout: the server layout fetches the panel
// media and passes the rendered panel content down; this shell only
// decides which side it sits on (usePathname is client-only) and owns
// the entry motion classes.
export function AuthShell({ panel, children }: { panel: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const panelLeft = LEFT_PANEL_ROUTES.some((route) => pathname.startsWith(route));
  return (
    <main className={cn('flex min-h-screen', panelLeft && 'flex-row-reverse')}>
      <div className="bg-background flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="auth-rise flex w-full flex-col items-center">{children}</div>
      </div>
      {/* Decorative panel — atmosphere, not navigation. Hidden below lg;
          overflow-hidden clips the photo's slow drift overscan. */}
      <aside
        aria-hidden="true"
        className="bg-primary relative hidden overflow-hidden lg:block lg:w-[44%]"
      >
        {panel}
      </aside>
    </main>
  );
}
