import { count, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, user } from '@/db/schema';
import { firstParam } from './admin-params';

export const ADMIN_SELLERS_PAGE_SIZE = 100;

export type ApprovalFilter = 'pending' | 'approved' | 'rejected';

export function parseApprovalFilter(raw: string | string[] | undefined): ApprovalFilter {
  const value = firstParam(raw);
  switch (value) {
    case 'approved':
    case 'rejected':
      return value;
    case 'pending':
    case undefined:
    default:
      return 'pending';
  }
}

export async function getAdminSellerApplications(filter: ApprovalFilter) {
  const [list, pendingCountRow] = await Promise.all([
    db
      .select({
        id: artisanProfiles.id,
        shopName: artisanProfiles.shopName,
        approvalStatus: artisanProfiles.approvalStatus,
        createdAt: artisanProfiles.createdAt,
        applicantName: user.name,
        applicantEmail: user.email,
      })
      .from(artisanProfiles)
      .innerJoin(user, eq(user.id, artisanProfiles.userId))
      .where(eq(artisanProfiles.approvalStatus, filter))
      .orderBy(desc(artisanProfiles.createdAt))
      .limit(ADMIN_SELLERS_PAGE_SIZE),
    db
      .select({ value: count() })
      .from(artisanProfiles)
      .where(eq(artisanProfiles.approvalStatus, 'pending')),
  ]);

  return { list, pendingCount: pendingCountRow[0]?.value ?? 0 };
}
