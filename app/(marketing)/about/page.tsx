import type { Metadata } from 'next';
import { Reveal } from '@/components/motion/reveal';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Balikha is a marketplace for independent Filipino artisans to sell handmade work, built to frame each maker the way a gallery frames an artist.',
};

export default function AboutPage() {
  return (
    <div className="py-section mx-auto max-w-2xl px-4 sm:px-6">
      <h1 className="text-headline font-serif">About Balikha</h1>

      <p className="text-foreground text-lead max-w-copy mt-8 leading-relaxed">
        Balikha is a marketplace where independent Filipino artisans list and sell their handmade
        work, and where buyers come to discover it.
      </p>

      <p className="max-w-copy text-muted-foreground mt-6 space-y-6 leading-relaxed">
        Pottery, textiles, wood, silver, leather, glass, soap, paper, coffee: the work of small
        makers who do the craft with their own hands.
      </p>

      <Reveal variant="soft" className="mt-14">
        <section>
          <h2 className="text-title font-serif">Why we built it</h2>
          <div className="text-muted-foreground max-w-copy mt-5 space-y-6 leading-relaxed">
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
      </Reveal>

      <Reveal variant="soft" className="mt-14">
        <section>
          <h2 className="text-title font-serif">How we think about it</h2>
          <div className="text-muted-foreground max-w-copy mt-5 space-y-6 leading-relaxed">
            <p>
              The idea is simple: treat each maker the way a gallery treats an artist. The hands
              stay visible, the story is told plainly, and the work is presented with the dignity
              that the time and skill in it deserve.
            </p>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
