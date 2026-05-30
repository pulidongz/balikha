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
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: '0 0 16px' }}>
          Welcome to Balikha. Confirm this email address to finish setting up your account and start
          discovering work by independent Filipino makers.
        </Text>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: 0 }}>
          The link below is valid for 24 hours.
        </Text>
      </Section>
      <Section style={{ margin: '0 0 36px' }}>
        <EmailButton href={verifyUrl}>Verify email address</EmailButton>
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
