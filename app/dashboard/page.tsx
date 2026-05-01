import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { SignOutButton } from '@/components/auth/sign-out-button';

export const metadata = {
  title: 'Dashboard · Balikha',
};

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  // Middleware should prevent unauthenticated requests, but double-check
  // server-side in case middleware is bypassed (e.g. RSC client navigation).
  if (!session) {
    redirect('/sign-in');
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as {session.user.name} ({session.user.email})
          </p>
        </div>
        <SignOutButton />
      </header>

      <section className="rounded-lg border p-6">
        <h2 className="font-medium">Welcome to Balikha</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Becoming a seller, catalogs, and product management arrive in Phases 4–5.
        </p>
      </section>
    </main>
  );
}
