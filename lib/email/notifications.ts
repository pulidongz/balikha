import { createElement } from 'react';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email/send';
import { getEmailRecipient } from '@/lib/email/recipient';
import { NewMessageEmail } from '@/lib/email/templates/new-message-email';
import { OrderNotificationEmail } from '@/lib/email/templates/order-notification-email';
import { SellerApplicationEmail } from '@/lib/email/templates/seller-application-email';
import { ListingTakedownEmail } from '@/lib/email/templates/listing-takedown-email';

// Consumer-level email dispatch for cross-session notifications (messages,
// orders). Mirrors lib/notifications/emit.ts: a dispatch failure is logged
// and SWALLOWED so it can never break the user-facing action that already
// committed. sendEmail (the primitive) still surfaces every failure as a
// Result; this layer is where the consumer policy (log + swallow) lives.

// ---- Message channel ------------------------------------------------------

export interface MessageEmailDispatch {
  recipientUserId: string;
  heading: string;
  preview: string;
  // RELATIVE in-app path; the absolute URL is built here from
  // NEXT_PUBLIC_APP_URL (emails cannot use relative links).
  url: string;
}

// ---- Order channel --------------------------------------------------------

export type OrderEmailKind =
  | 'new_order'
  | 'order_accepted'
  | 'order_shipped'
  | 'order_completed'
  | 'order_disputed'
  | 'order_admin_cancelled'
  | 'order_admin_completed';

export interface OrderEmailDispatch {
  recipientUserId: string;
  kind: OrderEmailKind;
  orderReference: string;
  productTitle: string;
  url: string; // RELATIVE
}

interface OrderEmailCopy {
  heading: string;
  intro: string;
  ctaLabel: string;
}

// Email-channel copy lives in the email layer (NOT the order domain) so the
// in-app notification titles and the email wording can evolve independently.
const ORDER_EMAIL_COPY: Record<OrderEmailKind, OrderEmailCopy> = {
  new_order: {
    heading: 'New order to review',
    intro:
      'A buyer has placed an order and is waiting for your response. Accept it to start arranging payment.',
    ctaLabel: 'Review the order',
  },
  order_accepted: {
    heading: 'Your order was accepted',
    intro: 'The maker accepted your order. Open it to arrange payment together.',
    ctaLabel: 'View your order',
  },
  order_shipped: {
    heading: 'Your order is on the way',
    intro: 'The maker marked your order as shipped.',
    ctaLabel: 'Track your order',
  },
  order_completed: {
    heading: 'Order completed',
    intro: 'The buyer confirmed they received this order — it is now complete.',
    ctaLabel: 'View the order',
  },
  order_disputed: {
    heading: 'A dispute was filed',
    intro:
      'A dispute was opened on this order. Open it to add your side — Balikha support will review.',
    ctaLabel: 'View the dispute',
  },
  order_admin_cancelled: {
    heading: 'Your order was cancelled by Balikha support',
    intro: 'Balikha support cancelled this order while resolving a dispute.',
    ctaLabel: 'View the order',
  },
  order_admin_completed: {
    heading: 'Your order was completed by Balikha support',
    intro: 'Balikha support marked this order complete while resolving a dispute.',
    ctaLabel: 'View the order',
  },
};

function absoluteUrl(relativeUrl: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}${relativeUrl}`;
}

export async function dispatchMessageEmail(d: MessageEmailDispatch): Promise<void> {
  try {
    const recipient = await getEmailRecipient(d.recipientUserId);
    if (!recipient) {
      logger.warn(
        { recipientUserId: d.recipientUserId },
        'new-message email skipped: recipient not found',
      );
      return;
    }
    const result = await sendEmail({
      to: recipient.email,
      subject: `${d.heading} — Balikha`,
      react: createElement(NewMessageEmail, {
        heading: d.heading,
        preview: d.preview,
        conversationUrl: absoluteUrl(d.url),
      }),
    });
    if (!result.ok) {
      logger.error(
        {
          event: 'email.new_message.send_failed',
          recipientUserId: d.recipientUserId,
          errMessage: result.error,
        },
        'Failed to send new-message email',
      );
    }
  } catch (e) {
    // Consumer-level swallow (see module header): never break a committed
    // action over an email failure. Logged for observability.
    logger.error({ err: e, recipientUserId: d.recipientUserId }, 'dispatchMessageEmail failed');
  }
}

// ---- Seller-application channel -------------------------------------------

export interface SellerApplicationEmailDispatch {
  recipientUserId: string;
  decision: 'approved' | 'rejected';
  note?: string; // applicant-facing rejection reason, if provided
}

interface SellerApplicationEmailCopy {
  heading: string;
  intro: string;
  ctaLabel: string;
}

const SELLER_APPLICATION_EMAIL_COPY: Record<'approved' | 'rejected', SellerApplicationEmailCopy> = {
  approved: {
    heading: 'Your artist application was approved',
    intro:
      'Congratulations — your Balikha artist account is now active. You can start publishing your products and building your studio.',
    ctaLabel: 'Go to your dashboard',
  },
  rejected: {
    heading: 'Your artist application was not approved',
    intro:
      'Thank you for applying to sell on Balikha. Unfortunately your application was not approved at this time.',
    ctaLabel: 'View your dashboard',
  },
};

// Dispatches the decision email to the seller applicant.
// NEVER throws to its caller — runs in Next's after() post-commit, so an
// email failure must not fail the already-succeeded admin action. Logged
// for observability. This is the sanctioned log-and-continue pattern, not
// error swallowing of a user-visible operation.
export async function dispatchSellerApplicationEmail(
  d: SellerApplicationEmailDispatch,
): Promise<void> {
  try {
    const recipient = await getEmailRecipient(d.recipientUserId);
    if (!recipient) {
      logger.warn(
        { recipientUserId: d.recipientUserId, decision: d.decision },
        'seller-application email skipped: recipient not found',
      );
      return;
    }
    const copy = SELLER_APPLICATION_EMAIL_COPY[d.decision];
    const body =
      d.decision === 'rejected' && d.note ? `${copy.intro}\n\nReason: ${d.note}` : copy.intro;
    const result = await sendEmail({
      to: recipient.email,
      subject: `${copy.heading} — Balikha`,
      react: createElement(SellerApplicationEmail, {
        heading: copy.heading,
        body,
        ctaLabel: copy.ctaLabel,
        url: absoluteUrl('/dashboard'),
      }),
    });
    if (!result.ok) {
      logger.error(
        {
          event: 'email.seller_application.send_failed',
          decision: d.decision,
          recipientUserId: d.recipientUserId,
          errMessage: result.error,
        },
        'Failed to send seller-application email',
      );
    }
  } catch (e) {
    // Consumer-level swallow (see module header): never break a committed
    // action over an email failure. Logged for observability.
    logger.error(
      { err: e, recipientUserId: d.recipientUserId, decision: d.decision },
      'dispatchSellerApplicationEmail failed',
    );
  }
}

export async function dispatchOrderEmail(d: OrderEmailDispatch): Promise<void> {
  try {
    const recipient = await getEmailRecipient(d.recipientUserId);
    if (!recipient) {
      logger.warn(
        { recipientUserId: d.recipientUserId, kind: d.kind },
        'order email skipped: recipient not found',
      );
      return;
    }
    const copy = ORDER_EMAIL_COPY[d.kind];
    const result = await sendEmail({
      to: recipient.email,
      subject: `${copy.heading} — Balikha`,
      react: createElement(OrderNotificationEmail, {
        heading: copy.heading,
        intro: copy.intro,
        orderReference: d.orderReference,
        productTitle: d.productTitle,
        ctaLabel: copy.ctaLabel,
        orderUrl: absoluteUrl(d.url),
      }),
    });
    if (!result.ok) {
      logger.error(
        {
          event: 'email.order.send_failed',
          kind: d.kind,
          recipientUserId: d.recipientUserId,
          errMessage: result.error,
        },
        'Failed to send order email',
      );
    }
  } catch (e) {
    logger.error(
      { err: e, recipientUserId: d.recipientUserId, kind: d.kind },
      'dispatchOrderEmail failed',
    );
  }
}

// ---- Listing takedown channel ----------------------------------------------

export interface ListingTakedownEmailDispatch {
  recipientUserId: string;
  productTitle: string;
  reason: string;
}

export async function dispatchListingTakedownEmail(d: ListingTakedownEmailDispatch): Promise<void> {
  try {
    const recipient = await getEmailRecipient(d.recipientUserId);
    if (!recipient) {
      logger.warn(
        { event: 'email.listing_takedown.no_recipient', userId: d.recipientUserId },
        'No email recipient for listing takedown',
      );
      return;
    }
    const result = await sendEmail({
      to: recipient.email,
      subject: 'A listing was removed — Balikha',
      react: createElement(ListingTakedownEmail, {
        productTitle: d.productTitle,
        reason: d.reason,
        url: absoluteUrl('/dashboard'),
      }),
    });
    if (!result.ok) {
      logger.error(
        {
          event: 'email.listing_takedown.send_failed',
          userId: d.recipientUserId,
          error: result.error,
        },
        'Listing takedown email failed',
      );
    }
  } catch (e) {
    // Consumer-level swallow (see module header): never break a committed
    // action over an email failure. Logged for observability.
    logger.error(
      { err: e, recipientUserId: d.recipientUserId },
      'dispatchListingTakedownEmail failed',
    );
  }
}
