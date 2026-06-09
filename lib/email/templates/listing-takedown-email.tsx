import { Section, Text } from 'react-email';
import { EmailLayout, EmailButton } from '@/lib/email/templates/_layout';

interface ListingTakedownEmailProps {
  productTitle: string; // title of the removed listing
  reason: string; // admin-provided reason
  url: string; // ABSOLUTE URL for the CTA (seller dashboard)
}

export function ListingTakedownEmail({ productTitle, reason, url }: ListingTakedownEmailProps) {
  const heading = 'A listing was removed from Balikha';
  return (
    <EmailLayout preview={heading} heading={heading}>
      <Section style={{ margin: '0 0 28px' }}>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: 0 }}>
          Your listing <strong>{productTitle}</strong> was removed by an administrator.
        </Text>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: '16px 0 0' }}>
          <strong>Reason:</strong> {reason}
        </Text>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: '16px 0 0' }}>
          If you have questions about this decision, please contact Balikha support.
        </Text>
      </Section>
      <Section style={{ margin: '0 0 8px' }}>
        <EmailButton href={url}>Go to your dashboard</EmailButton>
      </Section>
    </EmailLayout>
  );
}
