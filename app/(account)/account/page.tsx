import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-helpers';

export const metadata = {
  title: 'Profile · Balikha',
};

// Phase 2 placeholder. Phase 3 of the buyer-accounts plan replaces this with
// the full profile form (name, avatar, etc.).
export default async function AccountProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in?next=/account');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">Your account details.</p>
      </header>

      <dl className="bg-card grid grid-cols-1 gap-4 rounded-md border p-6 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-xs tracking-wide uppercase">Name</dt>
          <dd className="mt-1 text-sm">{user.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs tracking-wide uppercase">Email</dt>
          <dd className="mt-1 text-sm">{user.email}</dd>
        </div>
      </dl>
    </div>
  );
}
