import { Link, Section, Text } from 'react-email';
import { EmailLayout, EmailButton } from '@/lib/email/templates/_layout';

export interface WeeklyDigestCounts {
  newFollowers: number;
  appreciations: number;
  comments: number;
  newMessageThreads: number;
}

interface WeeklyDigestEmailProps {
  shopName: string;
  counts: WeeklyDigestCounts;
  studioUrl: string;
  unsubscribeUrl: string;
}

function line(count: number, singular: string, plural: string): string | null {
  if (count === 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

// Weekly traction digest (T10). The sender guarantees at least one
// non-zero count — a zero-activity week never sends ("you got nothing
// this week" is not an email anyone wants).
export function WeeklyDigestEmail({
  shopName,
  counts,
  studioUrl,
  unsubscribeUrl,
}: WeeklyDigestEmailProps) {
  const lines = [
    line(counts.newFollowers, 'new follower', 'new followers'),
    line(counts.appreciations, 'appreciation on your work', 'appreciations on your work'),
    line(counts.comments, 'comment on your work', 'comments on your work'),
    line(counts.newMessageThreads, 'new conversation started', 'new conversations started'),
  ].filter((l): l is string => l !== null);

  return (
    <EmailLayout preview={`Your week at ${shopName}`} heading={`Your week at ${shopName}`}>
      <Section style={{ margin: '0 0 24px' }}>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: 0 }}>
          People found your work this week:
        </Text>
      </Section>
      <Section style={{ margin: '0 0 28px' }}>
        <div style={{ backgroundColor: '#EEE9DD', borderRadius: '8px', padding: '16px 18px' }}>
          {lines.map((l) => (
            <Text
              key={l}
              style={{ fontSize: '15px', lineHeight: 1.8, margin: 0, color: '#1A2B3A' }}
            >
              · {l}
            </Text>
          ))}
        </div>
      </Section>
      <Section style={{ margin: '0 0 8px' }}>
        <EmailButton href={studioUrl}>Visit your studio</EmailButton>
      </Section>
      <Section style={{ margin: '24px 0 0' }}>
        <Text style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#52616F' }}>
          You&rsquo;re receiving this weekly summary because you have a studio on Balikha.{' '}
          <Link href={unsubscribeUrl} style={{ color: '#52616F', textDecoration: 'underline' }}>
            Unsubscribe from digests
          </Link>
          .
        </Text>
      </Section>
    </EmailLayout>
  );
}
