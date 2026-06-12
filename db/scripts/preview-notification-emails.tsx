import { sendEmail } from '@/lib/email/send';
import { logger } from '@/lib/logger';
import { NewMessageEmail } from '@/lib/email/templates/new-message-email';
import { OrderNotificationEmail } from '@/lib/email/templates/order-notification-email';
import { WeeklyDigestEmail } from '@/lib/email/templates/weekly-digest-email';
import { VerifyEmail } from '@/lib/email/templates/verify-email';
import { ResetPasswordEmail } from '@/lib/email/templates/reset-password';
import { SellerApplicationEmail } from '@/lib/email/templates/seller-application-email';
import { ListingTakedownEmail } from '@/lib/email/templates/listing-takedown-email';
import { SystemTestEmail } from '@/lib/email/templates/system-test';
import { env } from '@/env';

// Dev-only visual preview. Renders every email template through sendEmail; in
// dev (NODE_ENV !== 'production') this writes branded HTML to .dev-mail/ rather
// than sending. Use as the redesign verification surface.
// Run: npm run email:preview:notifications

const SAMPLE_IMAGE =
  '/uploads/updates/18b9a0c4-7ce8-49f0-9a3b-e2f2fde7beb2/update-1781174329349-0.jpg';

async function main() {
  const to = process.argv[2] ?? 'preview@example.invalid';

  // 1. NewMessageEmail — with hero image
  const message = await sendEmail({
    to,
    subject: 'New message about Burnay jar, large — Balikha',
    react: (
      <NewMessageEmail
        heading="New message about Burnay jar, large"
        preview="Hi! Does this ship to Cebu? And do you accept GCash?"
        conversationUrl="http://localhost:3000/dashboard/messages/preview"
        heroImageUrl={`${env.NEXT_PUBLIC_APP_URL}${SAMPLE_IMAGE}`}
      />
    ),
  });
  if (!message.ok) {
    logger.error({ err: message.error }, 'new-message preview failed');
    process.exit(1);
  }

  // 2. NewMessageEmail — no hero image
  const messageNoPhoto = await sendEmail({
    to,
    subject: 'New message about Burnay jar, large — Balikha (no photo)',
    react: (
      <NewMessageEmail
        heading="New message about Burnay jar, large"
        preview="Hi! Does this ship to Cebu? And do you accept GCash?"
        conversationUrl="http://localhost:3000/dashboard/messages/preview"
      />
    ),
  });
  if (!messageNoPhoto.ok) {
    logger.error({ err: messageNoPhoto.error }, 'new-message (no photo) preview failed');
    process.exit(1);
  }

  // 3. OrderNotificationEmail — with hero image
  const order = await sendEmail({
    to,
    subject: 'New order to review — Balikha',
    react: (
      <OrderNotificationEmail
        heading="New order to review"
        intro="A buyer has placed an order and is waiting for your response."
        orderReference="BK-7F3K2P"
        productTitle="Burnay jar, large"
        ctaLabel="Review the order"
        orderUrl="http://localhost:3000/dashboard/orders/preview"
        heroImageUrl={`${env.NEXT_PUBLIC_APP_URL}${SAMPLE_IMAGE}`}
      />
    ),
  });
  if (!order.ok) {
    logger.error({ err: order.error }, 'order preview failed');
    process.exit(1);
  }

  // 4. OrderNotificationEmail — no hero image
  const orderNoPhoto = await sendEmail({
    to,
    subject: 'New order to review — Balikha (no photo)',
    react: (
      <OrderNotificationEmail
        heading="New order to review"
        intro="A buyer has placed an order and is waiting for your response."
        orderReference="BK-7F3K2P"
        productTitle="Burnay jar, large"
        ctaLabel="Review the order"
        orderUrl="http://localhost:3000/dashboard/orders/preview"
      />
    ),
  });
  if (!orderNoPhoto.ok) {
    logger.error({ err: orderNoPhoto.error }, 'order (no photo) preview failed');
    process.exit(1);
  }

  // 5. WeeklyDigestEmail
  const digest = await sendEmail({
    to,
    subject: 'Weekly digest preview — Balikha',
    react: (
      <WeeklyDigestEmail
        shopName="Habian Heritage"
        counts={{ newFollowers: 3, appreciations: 12, comments: 2, newMessageThreads: 1 }}
        studioUrl={`${env.NEXT_PUBLIC_APP_URL}/studio/hablon-heritage`}
        unsubscribeUrl={`${env.NEXT_PUBLIC_APP_URL}/unsubscribe?token=preview`}
      />
    ),
  });
  if (!digest.ok) {
    logger.error({ err: digest.error }, 'weekly-digest preview failed');
    process.exit(1);
  }

  // 6. VerifyEmail
  const verify = await sendEmail({
    to,
    subject: 'Verify your email — Balikha',
    react: <VerifyEmail verifyUrl={`${env.NEXT_PUBLIC_APP_URL}/verify-email?token=preview`} />,
  });
  if (!verify.ok) {
    logger.error({ err: verify.error }, 'verify-email preview failed');
    process.exit(1);
  }

  // 7. ResetPasswordEmail
  const reset = await sendEmail({
    to,
    subject: 'Reset your password — Balikha',
    react: (
      <ResetPasswordEmail resetUrl={`${env.NEXT_PUBLIC_APP_URL}/reset-password?token=preview`} />
    ),
  });
  if (!reset.ok) {
    logger.error({ err: reset.error }, 'reset-password preview failed');
    process.exit(1);
  }

  // 8. SellerApplicationEmail
  const sellerApp = await sendEmail({
    to,
    subject: 'Artist application update — Balikha',
    react: (
      <SellerApplicationEmail
        heading="Your artist application was approved"
        body="Congratulations — your Balikha artist account is now active. You can start publishing your products and building your studio."
        ctaLabel="Go to your dashboard"
        url={`${env.NEXT_PUBLIC_APP_URL}/dashboard`}
      />
    ),
  });
  if (!sellerApp.ok) {
    logger.error({ err: sellerApp.error }, 'seller-application preview failed');
    process.exit(1);
  }

  // 9. ListingTakedownEmail
  const takedown = await sendEmail({
    to,
    subject: 'A listing was removed — Balikha',
    react: (
      <ListingTakedownEmail
        productTitle="Hand-loomed cotton shawl #12"
        reason="Listing photos could not be verified as the seller's own work."
        url={`${env.NEXT_PUBLIC_APP_URL}/dashboard/products`}
      />
    ),
  });
  if (!takedown.ok) {
    logger.error({ err: takedown.error }, 'listing-takedown preview failed');
    process.exit(1);
  }

  // 10. SystemTestEmail
  const systemTest = await sendEmail({
    to,
    subject: 'System test — Balikha',
    react: <SystemTestEmail recipientEmail={to} />,
  });
  if (!systemTest.ok) {
    logger.error({ err: systemTest.error }, 'system-test preview failed');
    process.exit(1);
  }

  logger.info({}, '10 template previews captured to .dev-mail/ (dev no-send mode).');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e }, 'preview-notification-emails script crashed');
    process.exit(1);
  });
