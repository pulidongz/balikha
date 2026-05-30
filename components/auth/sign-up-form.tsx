'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUp } from '@/lib/auth-client';
import { ContinueWithGoogleButton } from '@/components/auth/continue-with-google-button';
import { checkDisposableEmail } from '@/lib/actions/auth';
import { safeNextOr } from '@/lib/safe-next';
import { DISPOSABLE_EMAIL_MESSAGE } from '@/lib/auth-messages';

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
    // callbackURL is where Better Auth redirects after the user clicks the
    // email link. The deep-link `next` is encoded here (not in the
    // pending-state URL below) because the click often happens in a different
    // browser tab or device — encoding it in callbackURL ensures the verified
    // user lands where they were originally headed.
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
    // Route to the "check your inbox" page. `next` is not needed here — it
    // rides in the email's callbackURL and takes effect when the link is clicked.
    router.push(`/verify-email?status=pending&email=${encodeURIComponent(email)}`);
    router.refresh();
  }

  async function handleEmailBlur() {
    if (!email) return;
    const isDisp = await checkDisposableEmail(email);
    if (isDisp) {
      setError(DISPOSABLE_EMAIL_MESSAGE);
    }
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
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            onBlur={handleEmailBlur}
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
