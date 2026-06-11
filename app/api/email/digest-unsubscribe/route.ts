import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/db';
import { emailDigestOptOuts } from '@/db/schema';
import { verifyDigestUnsubscribeToken } from '@/lib/email/digest-unsubscribe';
import { logger } from '@/lib/logger';

// One-click unsubscribe from the weekly digest (T10). GET because it's an
// email link; the HMAC token authenticates without a session, so the link
// works from any device or mail client. Idempotent: re-clicking an old
// link lands on the same confirmation.
export async function GET(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get('uid');
  const token = request.nextUrl.searchParams.get('token');

  if (!uid || !token || !verifyDigestUnsubscribeToken(uid, token)) {
    return new NextResponse('Invalid unsubscribe link.', { status: 400 });
  }

  await db.insert(emailDigestOptOuts).values({ userId: uid }).onConflictDoNothing();
  logger.info({ userId: uid }, 'Weekly digest unsubscribed via email link');

  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed — Balikha</title></head>
<body style="font-family: Georgia, serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; color: #1A2B3A;">
<h1 style="font-size: 1.5rem;">You're unsubscribed</h1>
<p style="line-height: 1.6;">You won't receive the weekly digest anymore. You can turn it back on
any time from your studio settings.</p>
<p><a href="/dashboard/settings" style="color: #1A2B3A;">Back to studio settings</a></p>
</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
