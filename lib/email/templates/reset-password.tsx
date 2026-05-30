import { Section, Text } from 'react-email';
import { EmailLayout, EmailButton, FallbackUrl } from '@/lib/email/templates/_layout';

interface ResetPasswordEmailProps {
  resetUrl: string;
}

export function ResetPasswordEmail({ resetUrl }: ResetPasswordEmailProps) {
  return (
    <EmailLayout preview="Reset your Balikha password." heading="Reset your password">
      <Section style={{ margin: '0 0 28px' }}>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: '0 0 16px' }}>
          We received a request to reset your Balikha password. Choose a new one using the button
          below.
        </Text>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: 0 }}>
          The link is valid for 1 hour and can only be used once.
        </Text>
      </Section>
      <Section style={{ margin: '0 0 36px' }}>
        <EmailButton href={resetUrl}>Reset password</EmailButton>
      </Section>
      <FallbackUrl url={resetUrl} />
      <Section style={{ margin: '28px 0 0' }}>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: '0 0 12px', color: '#52616F' }}>
          For your security, resetting your password signs you out on all other devices.
          You&rsquo;ll need to sign in again there.
        </Text>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#52616F' }}>
          If you didn&rsquo;t request this, you can safely ignore this email. Your password stays
          unchanged.
        </Text>
      </Section>
    </EmailLayout>
  );
}
