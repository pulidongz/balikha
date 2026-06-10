'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUp } from '@/lib/auth-client';
import { ContinueWithGoogleButton } from '@/components/auth/continue-with-google-button';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';
import { checkDisposableEmail } from '@/lib/actions/auth';
import { safeNextOr } from '@/lib/safe-next';
import { DISPOSABLE_EMAIL_MESSAGE } from '@/lib/auth-messages';
import { composeName } from '@/lib/name';
import { suggestEmailDomain } from '@/lib/email/suggest-domain';
import type { TurnstileInstance } from '@marsidev/react-turnstile';

interface SignUpFormProps {
  googleEnabled: boolean;
}

export function SignUpForm({ googleEnabled }: SignUpFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Artist-intent signups (from the "Share your work" entry points) route into
  // the studio-creation flow; everyone else lands on the buyer account page. An
  // explicit, safe `next` (e.g. a proxy-bounce deep link) still wins, since
  // that is a page the user actually tried to reach. The `seller` value is an
  // internal identifier kept for analytics continuity (T4).
  const intent = searchParams.get('intent');
  const next = safeNextOr(
    searchParams.get('next'),
    intent === 'seller' ? '/dashboard/become-seller' : '/account',
  );
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Turnstile tokens are single-use. Reset the widget + clear the token on
  // any error so a fresh challenge is issued before the next attempt.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Set when the widget itself fails to load/run (script blocked, network,
  // bad key). Without surfacing it the submit button is disabled forever with
  // no explanation — a hard dead-end for users behind ad-blockers/proxies.
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);

  function handleTurnstileToken(token: string | null) {
    setTurnstileToken(token);
    if (token) setCaptchaError(null);
  }

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
    const result = await signUp.email(
      {
        email,
        password,
        name: composeName(firstName, lastName),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        callbackURL,
      },
      { headers: { 'x-captcha-response': turnstileToken ?? '' } },
    );
    setLoading(false);
    if (result.error) {
      // Reset the widget + clear the token on any error so the next attempt
      // gets a fresh challenge (tokens are single-use and short-lived).
      turnstileRef.current?.reset();
      setTurnstileToken(null);
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
    setEmailSuggestion(suggestEmailDomain(email));
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
          <p className="text-muted-foreground text-center text-xs">
            By continuing with Google, you agree to our{' '}
            <Link
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Terms
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Privacy Policy
            </Link>
            .
          </p>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="signup-first-name">First name</Label>
            <Input
              id="signup-first-name"
              name="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-last-name">Last name</Label>
            <Input
              id="signup-last-name"
              name="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              autoComplete="family-name"
              className="h-11"
            />
          </div>
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
              setEmailSuggestion(null);
            }}
            onBlur={handleEmailBlur}
            required
            autoComplete="email"
            className="h-11"
          />
        </div>
        {emailSuggestion && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground -mt-2 text-xs underline-offset-4 hover:underline"
            onClick={() => {
              setEmail(emailSuggestion);
              setEmailSuggestion(null);
            }}
          >
            Did you mean {emailSuggestion}?
          </button>
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="signup-password">Password</Label>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs"
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <Input
            id="signup-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
            className="h-11"
          />
        </div>
        <label
          htmlFor="signup-terms"
          className="text-muted-foreground flex items-start gap-2 text-sm"
        >
          <input
            id="signup-terms"
            name="acceptTerms"
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            required
            className="mt-0.5 h-4 w-4"
          />
          <span>
            I agree to the{' '}
            <Link
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Terms
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {(error || captchaError) && (
          <p role="alert" className="text-destructive text-sm">
            {error ?? captchaError}
          </p>
        )}
        <TurnstileWidget
          ref={turnstileRef}
          onToken={handleTurnstileToken}
          onError={() =>
            setCaptchaError(
              'Could not load the verification challenge. Please refresh and try again.',
            )
          }
        />
        <Button
          type="submit"
          disabled={loading || !turnstileToken || !acceptTerms}
          size="lg"
          className="h-11 w-full"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </div>
  );
}
