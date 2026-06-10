import { splitFullName } from '@/lib/name';

// Shape of the decoded Google ID token claims we read. Better Auth passes the
// full decoded JWT to mapProfileToUser; these are the OIDC name claims.
export interface GoogleNameProfile {
  given_name?: string;
  family_name?: string;
  name?: string;
}

// Map Google's structured name claims onto our firstName/lastName.
// - given_name/family_name when present (the normal case).
// - Mononym Google accounts omit family_name → lastName is explicitly null
//   (a real "no surname" state, not a masked default).
// - In the rare case given_name is also absent, split the display name.
export function mapGoogleProfileToNames(profile: GoogleNameProfile): {
  firstName: string;
  lastName: string | null;
} {
  if (profile.given_name) {
    return { firstName: profile.given_name, lastName: profile.family_name ?? null };
  }
  return splitFullName(profile.name ?? '');
}
