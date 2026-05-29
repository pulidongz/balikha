import { Button, Section, Text } from 'react-email';
import { EmailLayout } from '@/lib/email/templates/_layout';

interface ResetPasswordEmailProps {
  resetUrl: string;
}

export function ResetPasswordEmail({ resetUrl }: ResetPasswordEmailProps) {
  return (
    <EmailLayout preview="Reset your Balikha password.">
      <Section>
        <Text style={{ fontSize: '16px', lineHeight: 1.6, margin: '0 0 16px' }}>
          We received a request to reset your Balikha password.
        </Text>
        <Text style={{ fontSize: '16px', lineHeight: 1.6, margin: '0 0 24px' }}>
          Click the button below to choose a new one. The link is valid for 1 hour and can only be
          used once.
        </Text>
      </Section>
      <Section style={{ margin: '0 0 24px' }}>
        <Button
          href={resetUrl}
          style={{
            backgroundColor: '#1A2B3A',
            color: '#FDFCF7',
            padding: '12px 24px',
            borderRadius: '6px',
            fontSize: '15px',
            fontWeight: 500,
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Reset password
        </Button>
      </Section>
      <Section>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: '0 0 8px', color: '#52616F' }}>
          If the button doesn&rsquo;t work, paste this URL into your browser:
        </Text>
        <Text
          style={{
            fontSize: '13px',
            lineHeight: 1.5,
            margin: 0,
            color: '#52616F',
            wordBreak: 'break-all',
          }}
        >
          {resetUrl}
        </Text>
      </Section>
      <Section style={{ margin: '0 0 24px' }}>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#52616F' }}>
          For your security, resetting your password signs you out of all other devices.
          You&rsquo;ll need to sign in again on those devices.
        </Text>
      </Section>
      <Section style={{ margin: '24px 0 0' }}>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#52616F' }}>
          If you didn&rsquo;t request this, you can safely ignore the email — your password is
          unchanged.
        </Text>
      </Section>
    </EmailLayout>
  );
}
