import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Balikha collects, uses, and protects your personal data, and your rights under the Philippine Data Privacy Act of 2012 (RA 10173).',
};

const EFFECTIVE_DATE = 'June 6, 2026';

type Block = { type: 'p'; text: string } | { type: 'list'; items: string[] };
type Section = { heading: string; blocks: Block[] };

const SECTIONS: Section[] = [
  {
    heading: '1. Who This Policy Applies To',
    blocks: [
      {
        type: 'p',
        text: 'This Privacy Policy applies to all users of the Balikha platform, including:',
      },
      {
        type: 'list',
        items: [
          'Buyers who browse and purchase products.',
          'Artists (Artisans) who register and list products.',
          'Visitors who browse the Platform without an account.',
        ],
      },
    ],
  },
  {
    heading: '2. Information We Collect',
    blocks: [
      { type: 'p', text: '2.1 Account & Identity Information — when you register, we collect:' },
      {
        type: 'list',
        items: [
          'Full name',
          'Email address',
          'Username and password (stored in encrypted form)',
          'Profile photo (optional)',
          'Contact details (for Artists)',
        ],
      },
      { type: 'p', text: '2.2 Location Data — we collect location information to:' },
      {
        type: 'list',
        items: [
          'Enable Buyers to find artisans and products near them.',
          'Display region-based listings and artist locations.',
        ],
      },
      {
        type: 'p',
        text: "Location data may be collected through your device's GPS, IP address, or information you voluntarily provide (e.g., city/province in your profile). You may disable location access through your device settings, though this may limit certain features.",
      },
      { type: 'p', text: '2.3 User-Generated Content — Artists upload content including:' },
      {
        type: 'list',
        items: [
          'Product photos and images',
          'Product descriptions, titles, and pricing',
          'Studio profile information and story',
        ],
      },
      { type: 'p', text: 'Buyers may submit:' },
      {
        type: 'list',
        items: ['Product reviews and ratings', 'Messages sent to Artists through the Platform'],
      },
      {
        type: 'p',
        text: '2.4 Usage & Technical Data — we automatically collect certain technical information when you use the Platform, including:',
      },
      {
        type: 'list',
        items: [
          'Browser type and operating system',
          'Pages visited and time spent on the Platform',
          'Device identifiers and IP address',
          'Referring URLs',
        ],
      },
    ],
  },
  {
    heading: '3. How We Use Your Information',
    blocks: [
      { type: 'p', text: 'We use the information we collect to:' },
      {
        type: 'list',
        items: [
          'Create and manage your account.',
          'Enable Buyers and Artists to connect and transact.',
          'Display relevant products and artisans based on location.',
          'Send transactional notifications (e.g., new message alerts, account updates).',
          'Improve Platform features and user experience.',
          'Detect and prevent fraud, abuse, or violations of our Terms of Service.',
          'Comply with legal obligations under Philippine law.',
        ],
      },
      { type: 'p', text: 'We do not sell your personal data to third parties.' },
    ],
  },
  {
    heading: '4. Legal Basis for Processing',
    blocks: [
      {
        type: 'p',
        text: 'Under the Data Privacy Act of 2012, we process your personal data on the following grounds:',
      },
      {
        type: 'list',
        items: [
          'Consent: You have given us permission to process your data (e.g., upon registration).',
          'Contractual Necessity: Processing is required to provide you the services you requested.',
          'Legitimate Interests: To maintain platform security, prevent fraud, and improve our services.',
          'Legal Obligation: To comply with applicable Philippine laws and regulations.',
        ],
      },
    ],
  },
  {
    heading: '5. Data Sharing',
    blocks: [
      {
        type: 'p',
        text: 'We do not sell, rent, or trade your personal data. We may share data with:',
      },
      {
        type: 'list',
        items: [
          'Other Users: Artist profiles and product listings are visible to Buyers. Buyer messages are visible to the relevant Artist.',
          'Service Providers: Third-party vendors who assist with hosting, analytics, or platform operations, bound by confidentiality agreements.',
          'Legal Authorities: When required by Philippine law, court order, or lawful government request.',
        ],
      },
    ],
  },
  {
    heading: '6. Data Retention',
    blocks: [
      {
        type: 'p',
        text: 'We retain your personal data for as long as your account is active or as needed to provide services. Upon account deletion:',
      },
      {
        type: 'list',
        items: [
          'Account data is deleted or anonymized within 30 days.',
          'Certain data may be retained longer if required by law or to resolve disputes.',
          'User-generated content (e.g., product listings, reviews) may remain on the Platform in anonymized form.',
        ],
      },
    ],
  },
  {
    heading: '7. Your Rights as a Data Subject',
    blocks: [
      { type: 'p', text: 'Under the Data Privacy Act of 2012, you have the right to:' },
      {
        type: 'list',
        items: [
          'Be Informed: Know how your data is collected and used (this policy fulfills that obligation).',
          'Access: Request a copy of the personal data we hold about you.',
          'Rectification: Request correction of inaccurate or outdated personal data.',
          'Erasure / Right to be Forgotten: Request deletion of your data, subject to legal retention requirements.',
          'Object: Object to the processing of your data for direct marketing purposes.',
          'Data Portability: Request your data in a structured, commonly used format.',
          'Lodge a Complaint: File a complaint with the National Privacy Commission (NPC) at www.privacy.gov.ph.',
        ],
      },
      {
        type: 'p',
        text: 'To exercise any of these rights, email us at privacy@balikha.art. We will respond within 15 business days.',
      },
    ],
  },
  {
    heading: '8. Cookies and Tracking Technologies',
    blocks: [
      { type: 'p', text: 'We use cookies and similar technologies to:' },
      {
        type: 'list',
        items: [
          'Keep you logged in to your account.',
          'Remember your preferences.',
          'Analyze Platform usage and performance.',
        ],
      },
      {
        type: 'p',
        text: 'You can control cookie settings through your browser. Note that disabling cookies may affect Platform functionality.',
      },
    ],
  },
  {
    heading: '9. Data Security',
    blocks: [
      {
        type: 'p',
        text: 'We implement reasonable and appropriate technical and organizational security measures to protect your personal data from unauthorized access, loss, misuse, or alteration, including:',
      },
      {
        type: 'list',
        items: [
          'Encrypted storage of passwords.',
          'HTTPS encryption for all data in transit.',
          'Access controls limiting who can access personal data internally.',
        ],
      },
      {
        type: 'p',
        text: 'In the event of a data breach that poses a risk to your rights, we will notify you and the National Privacy Commission as required by law.',
      },
    ],
  },
  {
    heading: "10. Children's Privacy",
    blocks: [
      {
        type: 'p',
        text: 'Balikha is not intended for users under 18 years of age. We do not knowingly collect personal data from minors. If we become aware that a minor has registered, we will promptly delete their account and associated data.',
      },
    ],
  },
  {
    heading: '11. Changes to This Policy',
    blocks: [
      {
        type: 'p',
        text: 'We may update this Privacy Policy from time to time. When we do, we will post the updated policy with a new effective date and, where material changes are made, notify you via email or a notice on the Platform. Continued use of the Platform following notification constitutes acceptance of the updated policy.',
      },
    ],
  },
  {
    heading: '12. Contact & Data Protection',
    blocks: [
      {
        type: 'p',
        text: 'For privacy-related concerns, data subject requests, or questions about this policy, contact:',
      },
      {
        type: 'list',
        items: [
          'Balikha Artisan Marketplace',
          'Data Protection Officer: privacy@balikha.art',
          'Republic of the Philippines',
          'National Privacy Commission: www.privacy.gov.ph | complaints@privacy.gov.ph',
        ],
      },
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-20">
      <h1 className="font-serif text-3xl tracking-tight md:text-4xl">Privacy Policy</h1>
      <p className="text-muted-foreground mt-4 text-sm">
        Effective Date: {EFFECTIVE_DATE} · Pursuant to Republic Act No. 10173 — Data Privacy Act of
        2012
      </p>

      <p className="text-foreground mt-8 text-lg leading-relaxed">
        Balikha Artisan Marketplace (&ldquo;Balikha,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;) is committed to protecting your personal information. This Privacy Policy
        explains what data we collect, how we use it, and your rights as a data subject under
        Philippine law, specifically the Data Privacy Act of 2012 (RA 10173) and its Implementing
        Rules and Regulations.
      </p>

      {SECTIONS.map((section) => (
        <section key={section.heading} className="mt-12">
          <h2 className="font-serif text-2xl tracking-tight">{section.heading}</h2>
          <div className="text-muted-foreground mt-5 space-y-4 leading-relaxed">
            {section.blocks.map((block, i) =>
              block.type === 'p' ? (
                <p key={i}>{block.text}</p>
              ) : (
                <ul key={i} className="list-disc space-y-2 pl-5">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ),
            )}
          </div>
        </section>
      ))}

      <p className="text-muted-foreground mt-14 text-sm leading-relaxed">
        This Privacy Policy is compliant with Republic Act No. 10173 (Data Privacy Act of 2012) and
        its Implementing Rules and Regulations issued by the National Privacy Commission of the
        Philippines.
      </p>
    </div>
  );
}
