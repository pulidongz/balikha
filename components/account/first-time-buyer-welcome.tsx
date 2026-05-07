import Link from 'next/link';

// Shown on /account when the buyer has zero feed/wishlist/recently-viewed/
// notifications. Calm, factual, no emoji confetti — tells them what they
// can do here. Per buyer-dashboard plan §4: "all-empty is qualitatively
// different from any-section-empty."
export function FirstTimeBuyerWelcome({ name }: { name: string }) {
  const firstName = name.split(' ')[0] ?? name;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl">Welcome, {firstName}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Discover handcrafted pieces from independent Filipino artisans.
        </p>
      </header>

      <div className="bg-card rounded-md border p-6">
        <h2 className="font-serif text-xl">Get started</h2>
        <ul className="mt-4 space-y-3 text-sm">
          <li>
            <Link
              href="/"
              className="text-foreground font-medium underline-offset-4 hover:underline"
            >
              Browse the marketplace
            </Link>
            <span className="text-muted-foreground"> — find artisans and pieces you love.</span>
          </li>
          <li>
            <span className="text-foreground font-medium">Save with the heart icon</span>
            <span className="text-muted-foreground">
              {' '}
              — anything you might want to come back to.
            </span>
          </li>
          <li>
            <span className="text-foreground font-medium">Follow artisans</span>
            <span className="text-muted-foreground">
              {' '}
              — see their new listings the moment they&rsquo;re posted.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
