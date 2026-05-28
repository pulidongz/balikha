import { Section, Text } from 'react-email';
import { EmailLayout } from '@/lib/email/templates/_layout';

interface SystemTestEmailProps {
  recipientEmail: string;
}

// Minimal template used only for AC verification. Not user-facing.
// First real templates (verification, reset) land in #14.
export function SystemTestEmail({ recipientEmail }: SystemTestEmailProps) {
  return (
    <EmailLayout preview="System test from Balikha">
      <Section>
        <Text style={{ fontSize: '16px', lineHeight: 1.6, margin: '0 0 16px' }}>
          This is a test email from the Balikha transactional email layer.
        </Text>
        <Text style={{ fontSize: '16px', lineHeight: 1.6, margin: '0 0 16px' }}>
          Sent to: <strong>{recipientEmail}</strong>
        </Text>
        <Text style={{ fontSize: '16px', lineHeight: 1.6, margin: 0 }}>
          If you received this, ticket #13 acceptance criterion 1a is satisfied.
        </Text>
      </Section>
    </EmailLayout>
  );
}
