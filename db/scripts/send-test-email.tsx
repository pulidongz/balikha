// CLI: send a single test email to verify the transactional layer end-to-end.
//
// Dev-mode (default):
//   npm run email:test -- your@gmail.com
// Renders the template and logs the HTML; no real send.
//
// Real send (for AC1a verification — requires verified Resend domain):
//   NODE_ENV=production npm run email:test -- your@gmail.com
// Sends through Resend.
//
// The script never reads NODE_ENV directly — it just calls sendEmail(),
// which makes the dev/prod decision based on env.NODE_ENV + resend client.

import { sendEmail } from '@/lib/email/send';
import { SystemTestEmail } from '@/lib/email/templates/system-test';
import { logger } from '@/lib/logger';

async function main(): Promise<void> {
  const recipient = process.argv[2];

  if (!recipient) {
    console.error('Usage: npm run email:test -- <recipient@example.com>');
    process.exit(1);
  }

  const result = await sendEmail({
    to: recipient,
    subject: 'Balikha — system test',
    react: <SystemTestEmail recipientEmail={recipient} />,
  });

  if (!result.ok) {
    logger.error({ err: result.error }, 'Test email failed');
    process.exit(1);
  }

  logger.info({ messageId: result.data.messageId }, 'Test email completed');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e }, 'Send-test-email script crashed');
    process.exit(1);
  });
