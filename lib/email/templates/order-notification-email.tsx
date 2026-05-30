import { Section, Text } from 'react-email';
import { EmailLayout, EmailButton } from '@/lib/email/templates/_layout';

interface OrderNotificationEmailProps {
  heading: string; // e.g. "New order to review"
  intro: string; // event-specific sentence
  orderReference: string; // e.g. "BK-7F3K2P"
  productTitle: string;
  ctaLabel: string; // e.g. "Review the order"
  orderUrl: string; // ABSOLUTE
}

export function OrderNotificationEmail({
  heading,
  intro,
  orderReference,
  productTitle,
  ctaLabel,
  orderUrl,
}: OrderNotificationEmailProps) {
  return (
    <EmailLayout preview={`${heading} — ${productTitle}`} heading={heading}>
      <Section style={{ margin: '0 0 24px' }}>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: 0 }}>{intro}</Text>
      </Section>
      <Section style={{ margin: '0 0 28px' }}>
        <div style={{ backgroundColor: '#EEE9DD', borderRadius: '8px', padding: '16px 18px' }}>
          <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: '0 0 4px', color: '#52616F' }}>
            Order {orderReference}
          </Text>
          <Text style={{ fontSize: '15px', lineHeight: 1.5, margin: 0, color: '#1A2B3A' }}>
            {productTitle}
          </Text>
        </div>
      </Section>
      <Section style={{ margin: '0 0 8px' }}>
        <EmailButton href={orderUrl}>{ctaLabel}</EmailButton>
      </Section>
    </EmailLayout>
  );
}
