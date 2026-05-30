import { Section, Text } from 'react-email';
import { EmailLayout, EmailButton, FallbackUrl } from '@/lib/email/templates/_layout';

interface VerifyEmailProps {
  verifyUrl: string;
}

export function VerifyEmail({ verifyUrl }: VerifyEmailProps) {
  return (
    <EmailLayout
      preview="Verify your email to finish setting up Balikha."
      heading="Verify your email"
    >
      <Section style={{ margin: '0 0 28px' }}>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: 0 }}>
          Confirm this email to finish setting up your Balikha account and start discovering work by
          independent Filipino makers.
        </Text>
      </Section>
      <Section style={{ margin: '0 0 14px' }}>
        <EmailButton href={verifyUrl}>Verify email address</EmailButton>
      </Section>
      <Section style={{ margin: '0 0 32px' }}>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#52616F' }}>
          This link expires in 24 hours.
        </Text>
      </Section>
      <FallbackUrl url={verifyUrl} />
      <Section style={{ margin: '28px 0 0' }}>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#52616F' }}>
          If you didn&rsquo;t sign up for Balikha, you can ignore this email.
        </Text>
      </Section>
    </EmailLayout>
  );
}
