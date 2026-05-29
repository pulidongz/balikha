import { Button, Section, Text } from 'react-email';
import { EmailLayout } from '@/lib/email/templates/_layout';

interface VerifyEmailProps {
  verifyUrl: string;
}

export function VerifyEmail({ verifyUrl }: VerifyEmailProps) {
  return (
    <EmailLayout preview="Verify your email to finish setting up Balikha.">
      <Section>
        <Text style={{ fontSize: '16px', lineHeight: 1.6, margin: '0 0 16px' }}>
          Welcome to Balikha.
        </Text>
        <Text style={{ fontSize: '16px', lineHeight: 1.6, margin: '0 0 24px' }}>
          Click the button below to confirm this email address. The link is valid for 24 hours.
        </Text>
      </Section>
      <Section style={{ margin: '0 0 24px' }}>
        <Button
          href={verifyUrl}
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
          Verify email address
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
          {verifyUrl}
        </Text>
      </Section>
      <Section style={{ margin: '24px 0 0' }}>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#52616F' }}>
          If you didn&rsquo;t sign up for Balikha, you can ignore this email.
        </Text>
      </Section>
    </EmailLayout>
  );
}
