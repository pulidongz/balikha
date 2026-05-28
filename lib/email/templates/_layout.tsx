// Imports from the unified `react-email` package. Both `@react-email/components`
// (meta) AND all individual `@react-email/{body,container,...}` subpackages
// were deprecated in the React Email 6.0 release (April 2026). `react-email`
// is the alive, unified successor — confirmed via npm registry query during
// plan review.
import { Body, Container, Head, Html, Preview, Section, Text } from 'react-email';
import type { ReactNode } from 'react';

interface EmailLayoutProps {
  // Preview text shows in the inbox row beneath the subject. Keep under
  // 90 chars; longer text gets clipped by clients.
  preview: string;
  children: ReactNode;
}

// Shared layout for all transactional templates. Stays in the BRAND
// register per DESIGN.md — soft cream background, dark text, serif accent
// for the wordmark. Email clients are stuck in the 2000s for CSS, so we
// use inline styles only and limit to widely-supported properties.
//
// Hex values are hardcoded (NOT Tailwind tokens) because clients strip
// <style> blocks. If DESIGN.md tokens change, the email layout needs a
// manual sync. Reference: DESIGN.md:4-15.
export function EmailLayout({ preview, children }: EmailLayoutProps) {
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
            padding: '40px 24px',
          }}
        >
          <Section>
            <Text
              style={{
                fontFamily: 'Fraunces, Georgia, "Times New Roman", serif',
                fontSize: '24px',
                fontWeight: 400,
                margin: '0 0 32px',
                color: '#1A2B3A',
                letterSpacing: '-0.01em',
              }}
            >
              Balikha
            </Text>
          </Section>
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
              Balikha — an artisan marketplace.{' '}
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
