import { Section, Text } from 'react-email';
import { EmailLayout, EmailButton, FallbackUrl } from '@/lib/email/templates/_layout';

interface ChangeEmailProps {
  // The address the account would move TO. Shown so the recipient can spot an
  // unexpected change request — this email lands in their CURRENT inbox.
  newEmail: string;
  confirmUrl: string;
}

export function ChangeEmail({ newEmail, confirmUrl }: ChangeEmailProps) {
  return (
    <EmailLayout
      preview="Confirm the email change on your Balikha account."
      heading="Confirm your email change"
    >
      <Section style={{ margin: '0 0 28px' }}>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: 0 }}>
          We received a request to change the email on your Balikha account to{' '}
          <strong>{newEmail}</strong>. Confirm below to make the change. Until you do, your current
          email stays in place.
        </Text>
      </Section>
      <Section style={{ margin: '0 0 14px' }}>
        <EmailButton href={confirmUrl}>Confirm email change</EmailButton>
      </Section>
      <Section style={{ margin: '0 0 32px' }}>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#52616F' }}>
          This link expires in 24 hours.
        </Text>
      </Section>
      <FallbackUrl url={confirmUrl} />
      <Section style={{ margin: '28px 0 0' }}>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#52616F' }}>
          If you didn&rsquo;t request this change, ignore this email and your address will stay the
          same. Consider changing your password to keep your account secure.
        </Text>
      </Section>
    </EmailLayout>
  );
}
