export type UserStatus = 'active' | 'suspended' | 'banned';

export function deriveStatus(banned: boolean, banExpires: Date | null, now: Date): UserStatus {
  if (!banned) return 'active';
  if (banExpires !== null && banExpires > now) return 'suspended';
  return 'banned';
}

export const STATUS_PILL: Record<UserStatus, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-amber-100 text-amber-800',
  banned: 'bg-red-100 text-red-800',
};

export const ROLE_PILL: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  user: 'bg-gray-100 text-gray-700',
};
