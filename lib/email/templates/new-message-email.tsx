import { Section, Text } from 'react-email';
import { EmailLayout, EmailButton } from '@/lib/email/templates/_layout';

interface NewMessageEmailProps {
  // Direction-specific headline, already computed by the fan-out:
  //   buyer→seller: "New message about <product>"
  //   seller→buyer: "<shop name> replied"
  heading: string;
  // Truncated message body (the same 120-char preview the in-app
  // notification stores).
  preview: string;
  // ABSOLUTE url to the thread (dashboard or account side).
  conversationUrl: string;
  // Absolute URL of the piece's photo, when the conversation has product
  // context. Omitted → imageless card.
  heroImageUrl?: string;
}

export function NewMessageEmail({
  heading,
  preview,
  conversationUrl,
  heroImageUrl,
}: NewMessageEmailProps) {
  return (
    <EmailLayout preview={heading} heading={heading} heroImageUrl={heroImageUrl} heroImageAlt="">
      <Section style={{ margin: '0 0 24px' }}>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: 0 }}>
          You have a new message waiting in your Balikha inbox.
        </Text>
      </Section>
      <Section style={{ margin: '0 0 28px' }}>
        <div style={{ backgroundColor: '#EEE9DD', borderRadius: '8px', padding: '16px 18px' }}>
          <Text
            style={{
              fontSize: '15px',
              lineHeight: 1.6,
              margin: 0,
              color: '#1A2B3A',
              fontStyle: 'italic',
            }}
          >
            &ldquo;{preview}&rdquo;
          </Text>
        </div>
      </Section>
      <Section style={{ margin: '0 0 8px' }}>
        <EmailButton href={conversationUrl}>View &amp; reply</EmailButton>
      </Section>
      <Section style={{ margin: '24px 0 0' }}>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#52616F' }}>
          You&rsquo;re receiving this because someone messaged you on Balikha. Reply from your inbox
          to keep the conversation going.
        </Text>
      </Section>
    </EmailLayout>
  );
}
