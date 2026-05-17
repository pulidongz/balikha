import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Balikha is a marketplace for independent Filipino artisans to sell handmade work, built to frame each maker the way a gallery frames an artist.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-20">
      <h1 className="font-serif text-3xl tracking-tight md:text-4xl">About Balikha</h1>

      <p className="text-foreground mt-8 text-lg leading-relaxed">
        Balikha is a marketplace where independent Filipino artisans list and sell their handmade
        work, and where buyers come to discover it.
      </p>

      <div className="text-muted-foreground mt-6 space-y-6 leading-relaxed">
        <p>
          Pottery, textiles, wood, silver, leather, glass, soap, paper, coffee: the work of small
          makers who do the craft with their own hands.
        </p>
      </div>

      <section className="mt-14">
        <h2 className="font-serif text-2xl tracking-tight">Why we built it</h2>
        <div className="text-muted-foreground mt-5 space-y-6 leading-relaxed">
          <p>
            We built Balikha because handmade craft deserves better than a cramped grid. Big
            marketplaces flatten every maker into an identical listing and push buyers with price
            and urgency.
          </p>
          <p>
            We do the opposite. Balikha is editorial, not retail. We give each piece room to
            breathe, and we frame it rather than rank it.
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl tracking-tight">How we think about it</h2>
        <div className="text-muted-foreground mt-5 space-y-6 leading-relaxed">
          <p>
            The idea is simple: treat each maker the way a gallery treats an artist. The hands stay
            visible, the story is told plainly, and the work is presented with the dignity that the
            time and skill in it deserve.
          </p>
        </div>
      </section>
    </div>
  );
}
