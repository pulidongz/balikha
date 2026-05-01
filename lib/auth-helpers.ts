import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { artisanProfiles } from '@/db/schema';

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function getCurrentArtisanProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [profile] = await db
    .select()
    .from(artisanProfiles)
    .where(eq(artisanProfiles.userId, user.id))
    .limit(1);
  return profile ?? null;
}

// For dashboard sub-pages that only make sense for sellers. Redirects to
// /dashboard (which shows the become-seller form) if the user has no profile.
export async function requireSellerProfile() {
  const profile = await getCurrentArtisanProfile();
  if (!profile) redirect('/dashboard');
  return profile;
}
