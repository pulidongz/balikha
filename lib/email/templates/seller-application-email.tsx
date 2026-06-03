import { Section, Text } from 'react-email';
import { EmailLayout, EmailButton } from '@/lib/email/templates/_layout';

interface SellerApplicationEmailProps {
  heading: string; // e.g. "Your seller application was approved"
  body: string; // event-specific paragraph
  ctaLabel: string; // e.g. "Go to your dashboard"
  url: string; // ABSOLUTE URL for the CTA
}

export function SellerApplicationEmail({
  heading,
  body,
  ctaLabel,
  url,
}: SellerApplicationEmailProps) {
  return (
    <EmailLayout preview={heading} heading={heading}>
      <Section style={{ margin: '0 0 28px' }}>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: 0 }}>{body}</Text>
      </Section>
      <Section style={{ margin: '0 0 8px' }}>
        <EmailButton href={url}>{ctaLabel}</EmailButton>
      </Section>
    </EmailLayout>
  );
}
