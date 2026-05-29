'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn } from '@/lib/auth-client';
import { ContinueWithGoogleButton } from '@/components/auth/continue-with-google-button';
import { safeNextOr } from '@/lib/safe-next';

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

  async function attemptSignIn() {
    setError(null);
    setLoading(true);
    const result = await signIn.email({ email, password });
    setLoading(false);
    if (result.error) {
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
        <Button type="submit" disabled={loading} size="lg" className="h-11 w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
