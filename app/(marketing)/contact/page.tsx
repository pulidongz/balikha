import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Balikha team. We read every message.',
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-20">
      <h1 className="font-serif text-3xl tracking-tight md:text-4xl">Get in touch</h1>

      <p className="text-foreground mt-8 text-lg leading-relaxed">
        We would love to hear from you, and the door is open.
      </p>

      <div className="text-muted-foreground mt-6 space-y-6 leading-relaxed">
        <p>
          Whether you are a maker thinking about opening a shop, a buyer with a question about an
          order, or someone who just wants to say hello, we read every message and we try to reply
          like people, not a help desk.
        </p>
      </div>

      <section className="mt-14">
        <h2 className="font-serif text-2xl tracking-tight">Email us</h2>
        <p className="text-muted-foreground mt-5 leading-relaxed">
          Write to{' '}
          <a
            href="mailto:hello@balikha.com"
            className="text-accent underline-offset-4 hover:underline"
          >
            hello@balikha.com
          </a>{' '}
          and we will get back to you.
        </p>
      </section>
    </div>
  );
}
