import Link from 'next/link';
import { getCurrentSession } from '@/lib/auth-helpers';

export async function SiteFooter() {
  const session = await getCurrentSession();
  // T4 showcase-first framing: the artist CTA reads "Share your work", not
  // "Sell". Anonymous visitors go to intent-tagged signup; signed-in users go
  // straight to the studio-creation page (which self-redirects to /dashboard
  // if they already have a studio). The `intent=seller` param value is kept
  // as-is for analytics continuity — it is an internal identifier.
  const shareHref = session ? '/dashboard/become-seller' : '/sign-up?intent=seller';

  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-foreground font-serif text-base">Balikha</p>
          <p>Handmade work from independent artisans.</p>
        </div>
        <nav className="flex gap-6">
          <Link href={shareHref} className="hover:text-foreground">
            Share your work
          </Link>
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            Contact
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
