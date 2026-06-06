import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms governing your use of Balikha, the artisan marketplace connecting Filipino makers with buyers. Governed by the laws of the Republic of the Philippines.',
};

const EFFECTIVE_DATE = 'June 6, 2026';

type Block = { type: 'p'; text: string } | { type: 'list'; items: string[] };
type Section = { heading: string; blocks: Block[] };

const SECTIONS: Section[] = [
  {
    heading: '1. Acceptance of Terms',
    blocks: [
      {
        type: 'p',
        text: 'By creating an account or using the Platform in any way, you confirm that you are at least 18 years old, have read and understood these Terms, and agree to be legally bound by them. If you do not agree, please do not use the Platform.',
      },
    ],
  },
  {
    heading: '2. Description of the Platform',
    blocks: [
      { type: 'p', text: 'Balikha is a marketplace platform that enables:' },
      {
        type: 'list',
        items: [
          'Artisans ("Sellers") to list, showcase, and offer handcrafted and artisanal products for sale.',
          'Customers ("Buyers") to discover and purchase products directly from Sellers.',
        ],
      },
      {
        type: 'p',
        text: 'Important: Balikha does not process payments. All transactions are arranged directly between Buyers and Sellers. Balikha is not a party to any transaction and assumes no responsibility for payment disputes, product quality, delivery, or fulfillment.',
      },
    ],
  },
  {
    heading: '3. User Accounts',
    blocks: [
      {
        type: 'p',
        text: '3.1 Registration — to use certain features, you must create an account. You agree to provide accurate, complete, and current information and to keep your login credentials confidential. You are responsible for all activity that occurs under your account.',
      },
      { type: 'p', text: '3.2 Account Types:' },
      {
        type: 'list',
        items: [
          'Buyer Account: For individuals who wish to browse and purchase products.',
          'Seller Account: For artisans who wish to list and sell products on the Platform.',
        ],
      },
      {
        type: 'p',
        text: '3.3 Account Termination — Balikha reserves the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or harm other users or the Platform.',
      },
    ],
  },
  {
    heading: '4. Seller Obligations',
    blocks: [
      { type: 'p', text: 'Sellers agree to:' },
      {
        type: 'list',
        items: [
          'List only genuine, handcrafted, or artisanal products that they are legally permitted to sell.',
          'Provide accurate product descriptions, photographs, and pricing information.',
          'Communicate promptly and honestly with Buyers.',
          'Honor commitments made to Buyers through the Platform.',
          'Comply with all applicable Philippine laws, including consumer protection regulations under Republic Act No. 7394 (Consumer Act of the Philippines).',
        ],
      },
      {
        type: 'p',
        text: 'Balikha reserves the right to remove listings that are misleading, prohibited, or that violate these Terms.',
      },
    ],
  },
  {
    heading: '5. Buyer Obligations',
    blocks: [
      { type: 'p', text: 'Buyers agree to:' },
      {
        type: 'list',
        items: [
          'Use the Platform only for lawful purposes.',
          'Communicate respectfully with Sellers.',
          'Understand that payment and fulfillment arrangements are made directly with Sellers, outside of the Platform.',
          'Not misrepresent their identity or intentions when contacting Sellers.',
        ],
      },
    ],
  },
  {
    heading: '6. Prohibited Conduct',
    blocks: [
      { type: 'p', text: 'All users are prohibited from:' },
      {
        type: 'list',
        items: [
          'Listing or purchasing counterfeit, stolen, or illegal goods.',
          'Harassing, threatening, or deceiving other users.',
          'Scraping, copying, or reproducing Platform content without permission.',
          'Attempting to circumvent the Platform to avoid any future applicable fees.',
          'Posting false reviews or manipulating the rating system.',
          'Using the Platform to distribute spam, malware, or unsolicited communications.',
        ],
      },
    ],
  },
  {
    heading: '7. Intellectual Property',
    blocks: [
      {
        type: 'p',
        text: 'All content on the Platform, including the Balikha name, logo, interface design, and original text, is owned by or licensed to Balikha and protected under applicable intellectual property laws.',
      },
      {
        type: 'p',
        text: 'Sellers retain ownership of their product photos, descriptions, and creative content, but grant Balikha a non-exclusive, royalty-free license to display and promote such content on the Platform.',
      },
    ],
  },
  {
    heading: '8. User-Generated Content',
    blocks: [
      {
        type: 'p',
        text: 'By uploading photos, product listings, or other content to the Platform, you represent that:',
      },
      {
        type: 'list',
        items: [
          'You own or have the right to use and share such content.',
          'The content does not infringe any third-party rights.',
          'The content does not violate any applicable law or these Terms.',
        ],
      },
      {
        type: 'p',
        text: 'Balikha may remove content at its discretion if it is found to be in violation of these Terms.',
      },
    ],
  },
  {
    heading: '9. Limitation of Liability',
    blocks: [
      {
        type: 'p',
        text: 'To the fullest extent permitted by Philippine law, Balikha shall not be liable for:',
      },
      {
        type: 'list',
        items: [
          'Any transaction disputes between Buyers and Sellers.',
          'Product defects, non-delivery, or misrepresentation by Sellers.',
          'Loss of data, revenue, or business opportunity arising from use of the Platform.',
          'Any indirect, incidental, or consequential damages arising from use of the Platform.',
        ],
      },
      {
        type: 'p',
        text: "Balikha's total liability, if any, shall not exceed the amount paid (if any) by the user to Balikha in the 12 months preceding the claim.",
      },
    ],
  },
  {
    heading: '10. Dispute Resolution',
    blocks: [
      {
        type: 'p',
        text: 'Balikha encourages users to resolve disputes amicably. If a dispute cannot be resolved informally, it shall be submitted to the appropriate courts of the Philippines, specifically in the city or municipality where Balikha is principally based, in accordance with Philippine law.',
      },
    ],
  },
  {
    heading: '11. Modifications to These Terms',
    blocks: [
      {
        type: 'p',
        text: 'Balikha reserves the right to update these Terms at any time. Material changes will be communicated via email or a prominent notice on the Platform. Continued use of the Platform after changes take effect constitutes acceptance of the revised Terms.',
      },
    ],
  },
  {
    heading: '12. Governing Law',
    blocks: [
      {
        type: 'p',
        text: 'These Terms shall be governed by and construed in accordance with the laws of the Republic of the Philippines, without regard to conflict of law principles.',
      },
    ],
  },
  {
    heading: '13. Contact Us',
    blocks: [
      { type: 'p', text: 'If you have questions about these Terms, please contact us at:' },
      {
        type: 'list',
        items: [
          'Balikha Artisan Marketplace',
          'Email: legal@balikha.art',
          'Republic of the Philippines',
        ],
      },
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-20">
      <h1 className="font-serif text-3xl tracking-tight md:text-4xl">Terms of Service</h1>
      <p className="text-muted-foreground mt-4 text-sm">
        Effective Date: {EFFECTIVE_DATE} · Governed by the laws of the Republic of the Philippines
      </p>

      <p className="text-foreground mt-8 text-lg leading-relaxed">
        Welcome to Balikha, an online artisan marketplace that connects Filipino artisans with
        buyers. By accessing or using the Balikha platform (the &ldquo;Platform&rdquo;), you agree
        to be bound by these Terms of Service (&ldquo;Terms&rdquo;). Please read them carefully.
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
        By using Balikha, you acknowledge that you have read, understood, and agree to be bound by
        these Terms of Service.
      </p>
    </div>
  );
}
