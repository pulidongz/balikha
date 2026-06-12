// Imports from the unified `react-email` package. Both `@react-email/components`
// (meta) AND all individual `@react-email/{body,container,...}` subpackages
// were deprecated in the React Email 6.0 release (April 2026). `react-email`
// is the alive, unified successor — confirmed via npm registry query during
// plan review.
import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from 'react-email';
import type { ReactNode } from 'react';
import { env } from '@/env';

// Wordmark PNG is 155x34 (public/email/wordmark-cream.png). Displayed at
// 22px tall in the band; width = round(22 * 155 / 34).
const WORDMARK_DISPLAY_WIDTH = 100;

interface EmailLayoutProps {
  // Preview text shows in the inbox row beneath the subject. Keep under
  // 90 chars; longer text gets clipped by clients.
  preview: string;
  // Optional editorial headline (Fraunces) rendered inside the card with a
  // vermilion tick. The transactional H1 for the message.
  heading?: string;
  // Optional hero photo (the piece the email is about), absolute URL.
  // Rendered full-width at the top of the card, never cropped (object-fit
  // is unsupported in Outlook). Decorative: layout must read fine without it.
  heroImageUrl?: string;
  heroImageAlt?: string;
  children: ReactNode;
}

// Shared shell for all transactional templates: navy band carrying the
// PNG wordmark (real Fraunces survives webfont-stripping clients), white
// card on the cream body, footer outside the card. Direction A of the
// 2026-06-12 email redesign spec.
//
// Email clients are stuck in the 2000s for CSS: inline styles only,
// hardcoded hex (clients strip <style>; DESIGN.md tokens need manual
// sync), explicit image dimensions, no object-fit.
export function EmailLayout({
  preview,
  heading,
  heroImageUrl,
  heroImageAlt,
  children,
}: EmailLayoutProps) {
  const wordmarkUrl = `${env.NEXT_PUBLIC_APP_URL}/email/wordmark-cream.png`;
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
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 16px' }}>
          {/* Navy band — rounded top, square bottom; reads as one unit
              with the card below. */}
          <Section
            style={{
              backgroundColor: '#1A2B3A',
              borderRadius: '10px 10px 0 0',
              padding: '16px 24px',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- email HTML cannot use next/image */}
            <img
              src={wordmarkUrl}
              alt="Balikha"
              height={22}
              width={WORDMARK_DISPLAY_WIDTH}
              style={{ display: 'block' }}
            />
          </Section>
          {/* White card. No top border — the band caps it. */}
          <Section
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E6DFD1',
              borderTop: '0',
              borderRadius: '0 0 10px 10px',
            }}
          >
            {heroImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- email HTML cannot use next/image
              <img
                src={heroImageUrl}
                alt={heroImageAlt ?? ''}
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            ) : null}
            <div style={{ padding: '24px' }}>
              {heading ? (
                <Section style={{ margin: '0 0 24px' }}>
                  <Text
                    style={{
                      fontFamily: 'Fraunces, Georgia, "Times New Roman", serif',
                      fontSize: '28px',
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
                      marginTop: '14px',
                    }}
                  />
                </Section>
              ) : null}
              {children}
            </div>
          </Section>
          {/* Footer outside the card. The digest's in-body unsubscribe
              link is separate and unchanged (legal requirement). */}
          <Section style={{ marginTop: '20px' }}>
            <Text style={{ fontSize: '12px', color: '#52616F', margin: 0, lineHeight: 1.6 }}>
              Balikha, an artisan marketplace ·{' '}
              <a
                href="https://balikha.art"
                style={{ color: '#52616F', textDecoration: 'underline' }}
              >
                balikha.art
              </a>{' '}
              ·{' '}
              <a
                href={`${env.NEXT_PUBLIC_APP_URL}/account/notifications`}
                style={{ color: '#52616F', textDecoration: 'underline' }}
              >
                Email preferences
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

// Digest stat rows: large serif numeral beside its label, hairline rules
// between rows. Replaces prose bullet lists where the numbers ARE the
// message. Email-safe: a plain table, explicit borders, no flexbox.
export function EmailStatRows({ rows }: { rows: { value: number; label: string }[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.label}>
            <td
              style={{
                padding: '12px 16px 12px 0',
                borderBottom: i < rows.length - 1 ? '1px solid #E6DFD1' : 'none',
                fontFamily: 'Fraunces, Georgia, "Times New Roman", serif',
                fontSize: '28px',
                lineHeight: 1,
                color: '#1A2B3A',
                width: '1%',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle',
              }}
            >
              {row.value}
            </td>
            <td
              style={{
                padding: '12px 0',
                borderBottom: i < rows.length - 1 ? '1px solid #E6DFD1' : 'none',
                fontSize: '14px',
                lineHeight: 1.4,
                color: '#52616F',
                verticalAlign: 'middle',
              }}
            >
              {row.label}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
