'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUp } from '@/lib/auth-client';
import { ContinueWithGoogleButton } from '@/components/auth/continue-with-google-button';

// Same open-redirect guard as sign-in: same-origin paths only.
function safeNextOr(next: string | null, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  // Body characters: only same-origin path/query chars. Rejects CR/LF (\r, \n),
  // encoded variants (%0d, %0a), whitespace, @ smuggles, and other smuggle
  // vectors that could end up in a Location: header via Better Auth's redirect.
  if (!/^[A-Za-z0-9_\-/?&=.+,#]*$/.test(next.slice(1))) return fallback;
  return next;
}

interface SignUpFormProps {
  googleEnabled: boolean;
}

export function SignUpForm({ googleEnabled }: SignUpFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Seller-intent signups (from the "Sell your craft" entry point) route into
  // the shop-creation flow; everyone else lands on the buyer account page. An
  // explicit, safe `next` (e.g. a proxy-bounce deep link) still wins, since
  // that is a page the user actually tried to reach.
  const intent = searchParams.get('intent');
  const next = safeNextOr(
    searchParams.get('next'),
    intent === 'seller' ? '/dashboard/become-seller' : '/account',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function attemptSignUp() {
    setError(null);
    setLoading(true);
    // callbackURL is where Better Auth's /api/auth/verify-email route
    // redirects after the user clicks the email link. On success the URL
    // arrives as /verify-email?status=verified; on failure Better Auth
    // appends &error=<CODE>. Without an explicit callbackURL, Better Auth
    // defaults to '/' (homepage) — no "you're verified" confirmation.
    //
    // ★ Round-2 (Issue 4): the deep-link `next` is encoded INTO the
    // callbackURL, NOT into the pending-state URL below. The verification
    // click usually happens on a different surface (phone, another tab) than
    // the signup tab, so a `next` left only on the pending URL is lost the
    // moment the user crosses the email boundary. Carrying it through
    // callbackURL means Better Auth redirects the verified user straight to
    // where they were headed.
    const callbackURL =
      next !== '/account'
        ? `/verify-email?status=verified&next=${encodeURIComponent(next)}`
        : '/verify-email?status=verified';
    const result = await signUp.email({ email, password, name, callbackURL });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? 'Sign-up failed');
      return;
    }
    // Better Auth ran emailVerification.sendOnSignUp — the user has an
    // account row with emailVerified=false and a verification email on the
    // way. Route them to the "check your inbox" page. No `next` here: it
    // rides on the email's callbackURL above; this tab's user reaches their
    // destination after clicking the link (or on next navigation).
    router.push(`/verify-email?status=pending&email=${encodeURIComponent(email)}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {googleEnabled && (
        <>
          <ContinueWithGoogleButton next={next} />
          <div className="flex items-center gap-3">
            <div className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-xs tracking-wider uppercase">or</span>
            <div className="bg-border h-px flex-1" />
          </div>
        </>
      )}
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void attemptSignUp();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="signup-name">Name</Label>
          <Input
            id="signup-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-password">Password</Label>
          <Input
            id="signup-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
            className="h-11"
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} size="lg" className="h-11 w-full">
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </div>
  );
}
