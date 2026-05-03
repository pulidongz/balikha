import type { ReactNode } from 'react';
import { AdminHeader } from './admin-header';
import { AdminSidebar } from './admin-sidebar';

// Mobile sidebar (Sheet drawer) intentionally omitted — admin work is
// overwhelmingly desktop. If that turns out to be wrong, add a Sheet later.
export function AdminShell({ userName, children }: { userName: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AdminHeader userName={userName} />
      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 p-4 lg:grid-cols-[14rem_1fr] lg:p-8">
        <aside className="hidden lg:block">
          <AdminSidebar />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
