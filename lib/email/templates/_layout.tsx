// Imports from the unified `react-email` package. Both `@react-email/components`
// (meta) AND all individual `@react-email/{body,container,...}` subpackages
// were deprecated in the React Email 6.0 release (April 2026). `react-email`
// is the alive, unified successor — confirmed via npm registry query during
// plan review.
import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from 'react-email';
import type { ReactNode } from 'react';

interface EmailLayoutProps {
  // Preview text shows in the inbox row beneath the subject. Keep under
  // 90 chars; longer text gets clipped by clients.
  preview: string;
  // Optional editorial headline (Fraunces) rendered under the wordmark with a
  // vermilion tick. The transactional H1 for the message.
  heading?: string;
  children: ReactNode;
}

// Shared layout for all transactional templates. Stays in the BRAND
// register per DESIGN.md — soft cream background, dark text, serif accent
// for the wordmark and headline, a single vermilion tick as the earned accent.
// Email clients are stuck in the 2000s for CSS, so we use inline styles only
// and limit to widely-supported properties.
//
// Hex values are hardcoded (NOT Tailwind tokens) because clients strip
// <style> blocks. If DESIGN.md tokens change, the email layout needs a
// manual sync. Reference: DESIGN.md:4-15.
export function EmailLayout({ preview, heading, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: '#FDFCF7',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
          color: '#1A2B3A',
        }}
      >
        <Container
          style={{
            maxWidth: '560px',
            margin: '0 auto',
            padding: '48px 24px',
          }}
        >
          <Section>
            <Text
              style={{
                fontFamily: 'Fraunces, Georgia, "Times New Roman", serif',
                fontSize: '20px',
                fontWeight: 400,
                margin: heading ? '0 0 20px' : '0 0 32px',
                color: '#1A2B3A',
                letterSpacing: '-0.01em',
              }}
            >
              Balikha
            </Text>
          </Section>
          {heading ? (
            <Section style={{ margin: '0 0 28px' }}>
              <Text
                style={{
                  fontFamily: 'Fraunces, Georgia, "Times New Roman", serif',
                  fontSize: '30px',
                  fontWeight: 400,
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  margin: 0,
                  color: '#1A2B3A',
                }}
              >
                {heading}
              </Text>
              {/* Vermilion editorial tick — the single earned brand accent. */}
              <div
                style={{
                  width: '32px',
                  height: '3px',
                  backgroundColor: '#C8413C',
                  borderRadius: '2px',
                  marginTop: '16px',
                }}
              />
            </Section>
          ) : null}
          {children}
          <Section style={{ marginTop: '48px' }}>
            <Text
              style={{
                fontSize: '12px',
                color: '#52616F',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Balikha, an artisan marketplace.{' '}
              <a
                href="https://balikha.art"
                style={{ color: '#52616F', textDecoration: 'underline' }}
              >
                balikha.art
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Navy primary CTA — "navy carries the click" (DESIGN.md). rounded-lg (8px).
export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: '#1A2B3A',
        color: '#FDFCF7',
        padding: '13px 24px',
        borderRadius: '8px',
        fontSize: '15px',
        fontWeight: 500,
        textDecoration: 'none',
        display: 'inline-block',
      }}
    >
      {children}
    </Button>
  );
}

// Hairline divider + the paste-this-link fallback in a recessed oat block.
// Shared so both transactional templates present the fallback identically.
export function FallbackUrl({ url }: { url: string }) {
  return (
    <Section>
      <Hr style={{ borderColor: '#E6DFD1', borderTopWidth: '1px', margin: '0 0 24px' }} />
      <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: '0 0 10px', color: '#52616F' }}>
        If the button doesn&rsquo;t work, paste this link into your browser:
      </Text>
      <div style={{ backgroundColor: '#EEE9DD', borderRadius: '8px', padding: '12px 14px' }}>
        <Text
          style={{
            fontSize: '12px',
            lineHeight: 1.6,
            margin: 0,
            color: '#52616F',
            wordBreak: 'break-all',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          }}
        >
          {url}
        </Text>
      </div>
    </Section>
  );
}
