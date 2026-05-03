import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AdminRequiredError, UnauthorizedError, requireAdmin } from '@/lib/auth-helpers';
import { AdminShell } from '@/components/admin/admin-shell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // proxy.ts already redirects unauthenticated users to /sign-in; the
  // UnauthorizedError branch here is defense in depth (e.g., direct
  // server-side navigation in tests, or if proxy is misconfigured).
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/sign-in');
    if (e instanceof AdminRequiredError) redirect('/dashboard');
    throw e;
  }

  return <AdminShell userName={user.name}>{children}</AdminShell>;
}
