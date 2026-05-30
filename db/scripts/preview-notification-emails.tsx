import { sendEmail } from '@/lib/email/send';
import { logger } from '@/lib/logger';
import { NewMessageEmail } from '@/lib/email/templates/new-message-email';
import { OrderNotificationEmail } from '@/lib/email/templates/order-notification-email';

// Dev-only visual preview. Renders both new notification templates through
// sendEmail; in dev (NODE_ENV !== 'production') this writes branded HTML to
// .dev-mail/ rather than sending. Run: npm run email:preview:notifications
async function main() {
  const to = process.argv[2] ?? 'preview@example.invalid';

  const message = await sendEmail({
    to,
    subject: 'New message about Burnay jar, large — Balikha',
    react: (
      <NewMessageEmail
        heading="New message about Burnay jar, large"
        preview="Hi! Does this ship to Cebu? And do you accept GCash?"
        conversationUrl="http://localhost:3000/dashboard/messages/preview"
      />
    ),
  });
  if (!message.ok) {
    logger.error({ err: message.error }, 'new-message preview failed');
    process.exit(1);
  }

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
      />
    ),
  });
  if (!order.ok) {
    logger.error({ err: order.error }, 'order preview failed');
    process.exit(1);
  }

  logger.info({}, 'Previews captured to .dev-mail/ (dev no-send mode).');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e }, 'preview-notification-emails script crashed');
    process.exit(1);
  });
