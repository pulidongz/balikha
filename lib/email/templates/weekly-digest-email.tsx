import { Link, Section, Text } from 'react-email';
import { EmailLayout, EmailButton, EmailStatRows } from '@/lib/email/templates/_layout';

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

// Weekly traction digest (T10). The sender guarantees at least one
// non-zero count — a zero-activity week never sends ("you got nothing
// this week" is not an email anyone wants).
export function WeeklyDigestEmail({
  shopName,
  counts,
  studioUrl,
  unsubscribeUrl,
}: WeeklyDigestEmailProps) {
  const rows = [
    {
      value: counts.newFollowers,
      label: counts.newFollowers === 1 ? 'new follower' : 'new followers',
    },
    {
      value: counts.appreciations,
      label:
        counts.appreciations === 1 ? 'appreciation on your work' : 'appreciations on your work',
    },
    {
      value: counts.comments,
      label: counts.comments === 1 ? 'comment on your work' : 'comments on your work',
    },
    {
      value: counts.newMessageThreads,
      label:
        counts.newMessageThreads === 1 ? 'new conversation started' : 'new conversations started',
    },
  ].filter((r) => r.value > 0);

  return (
    <EmailLayout preview={`Your week at ${shopName}`} heading={`Your week at ${shopName}`}>
      <Section style={{ margin: '0 0 24px' }}>
        <Text style={{ fontSize: '16px', lineHeight: 1.65, margin: 0 }}>
          People found your work this week:
        </Text>
      </Section>
      <Section style={{ margin: '0 0 28px' }}>
        <EmailStatRows rows={rows} />
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
