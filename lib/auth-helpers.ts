import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { artisanProfiles, user } from '@/db/schema';
import { logger } from '@/lib/logger';

// --- Error classes ----------------------------------------------------------
// Server actions throw these and convert them to Result.err at the boundary
// (see balikha-backend-hardening-plan.md §5). Pages that don't use Result
// can let them propagate to Next's error boundary.

export class UnauthorizedError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Not authorized') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class AdminRequiredError extends Error {
  constructor(message = 'Admin required') {
    super(message);
    this.name = 'AdminRequiredError';
  }
}

// --- Session + user lookups -------------------------------------------------

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

// Better Auth's session.user doesn't include hand-managed columns like
// `is_admin`. Re-fetch the row from the DB so callers can read the role flag.
export async function getCurrentUserWithRole() {
  const session = await getCurrentSession();
  if (!session?.user) return null;
  const [row] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  return row ?? null;
}

// --- Throw-on-missing variants for server actions ---------------------------

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireArtisan() {
  const profile = await getCurrentArtisanProfile();
  if (!profile) throw new ForbiddenError('Artisan profile required');
  return profile;
}

export async function requireAdmin() {
  const u = await getCurrentUserWithRole();
  if (!u) throw new UnauthorizedError();
  if (!u.isAdmin) {
    logger.warn({ userId: u.id }, 'Non-admin attempted admin action');
    throw new AdminRequiredError();
  }
  return u;
}

// --- Page-level redirect variant --------------------------------------------
// For dashboard sub-pages that only make sense for sellers. Redirects to
// /dashboard (which shows the become-seller form) if the user has no profile.
export async function requireSellerProfile() {
  const profile = await getCurrentArtisanProfile();
  if (!profile) redirect('/dashboard');
  return profile;
}

// --- Generic ownership guard ------------------------------------------------
// Pattern: load the resource yourself, then assert ownership. Keeps the load
// query free to fetch whichever columns the caller actually needs.
//
//   const [catalog] = await db.select(...).from(catalogs).where(eq(...));
//   requireOwnership(catalog, profile.id);
export function requireOwnership<T extends { artisanProfileId: string } | null | undefined>(
  resource: T,
  ownerProfileId: string,
): NonNullable<T> {
  if (!resource) throw new ForbiddenError('Resource not found');
  if (resource.artisanProfileId !== ownerProfileId) {
    logger.warn(
      { ownerProfileId, resourceOwner: resource.artisanProfileId },
      'Ownership check failed',
    );
    throw new ForbiddenError('You do not own this resource');
  }
  return resource as NonNullable<T>;
}
