import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'A provisional draft of the terms for using Balikha, being finalized ahead of launch.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-20">
      <h1 className="font-serif text-3xl tracking-tight md:text-4xl">Terms</h1>

      <p className="text-foreground mt-8 text-lg leading-relaxed">These terms are a draft.</p>

      <div className="text-muted-foreground mt-6 space-y-6 leading-relaxed">
        <p>
          We are finalizing the full terms of service ahead of launch, and this page will be
          replaced with the complete version before Balikha goes live. In the meantime, here is the
          plain shape of how things work.
        </p>
      </div>

      <section className="mt-14">
        <h2 className="font-serif text-2xl tracking-tight">Balikha is a venue</h2>
        <p className="text-muted-foreground mt-5 leading-relaxed">
          We connect buyers and makers. We do not make or own the work sold here.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl tracking-tight">Payment is between buyer and seller</h2>
        <p className="text-muted-foreground mt-5 leading-relaxed">
          Payment is arranged directly between the buyer and the seller. Balikha is not a party to
          that transaction.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-serif text-2xl tracking-tight">Listings must be your own work</h2>
        <p className="text-muted-foreground mt-5 leading-relaxed">
          Listings must be the seller&apos;s own handmade work. Resold, mass-produced, or
          misrepresented items are not allowed.
        </p>
      </section>

      <div className="text-muted-foreground mt-14 leading-relaxed">
        <p>
          This is a working draft, and the final terms may differ. We will update this page well
          before launch.
        </p>
      </div>
    </div>
  );
}
