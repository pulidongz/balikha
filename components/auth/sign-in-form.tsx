'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn } from '@/lib/auth-client';
import { ContinueWithGoogleButton } from '@/components/auth/continue-with-google-button';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';
import { safeNextOr } from '@/lib/safe-next';
import type { TurnstileInstance } from '@marsidev/react-turnstile';

interface SignInFormProps {
  googleEnabled: boolean;
}

export function SignInForm({ googleEnabled }: SignInFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Default destination is the buyer surface — every signed-in user has
  // access to /account, whereas /dashboard redirects non-sellers off to
  // the become-seller flow. Sellers reach /dashboard from the avatar
  // dropdown's "My shop" link.
  const next = safeNextOr(searchParams.get('next'), '/account');
  // Surface OAuth failures that landed us back here via errorCallbackURL.
  const oauthErrored = searchParams.get('error') === 'oauth';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    oauthErrored ? 'Could not complete Google sign-in. Please try again.' : null,
  );
  const [loading, setLoading] = useState(false);
  // Turnstile tokens are single-use. The widget ref lets us call reset()
  // after any failed submit so a fresh challenge is issued before the next
  // attempt — without this, a typo'd-password retry would fail the captcha
  // gate even after correcting the password.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);

  async function attemptSignIn() {
    setError(null);
    setLoading(true);
    const result = await signIn.email(
      { email, password },
      { headers: { 'x-captcha-response': turnstileToken ?? '' } },
    );
    setLoading(false);
    if (result.error) {
      // Reset the widget + clear the token on any error so the next attempt
      // gets a fresh challenge (tokens are single-use and short-lived).
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      setError(result.error.message ?? 'Invalid email or password');
      return;
    }
    router.push(next);
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
          void attemptSignIn();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="signin-email">Email</Label>
          <Input
            id="signin-email"
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
          <div className="flex items-center justify-between">
            <Label htmlFor="signin-password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="signin-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="h-11"
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />
        <Button
          type="submit"
          disabled={loading || !turnstileToken}
          size="lg"
          className="h-11 w-full"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
