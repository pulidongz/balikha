import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AuthMark } from '@/components/auth/auth-mark';
import { safeNextOr } from '@/lib/safe-next';

export const metadata = {
  title: 'Verify your email',
};

interface VerifyEmailPageProps {
  searchParams: Promise<{ status?: string; email?: string; error?: string; next?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const status = params.status;
  const error = params.error;

  // Mode 1: post-signup pending state.
  if (status === 'pending') {
    return (
      <Card>
        <CardContent className="space-y-5 pt-1">
          <AuthMark variant="mail" className="auth-rise" />
          <div className="auth-rise space-y-2" style={{ animationDelay: '90ms' }}>
            <h1 className="font-serif text-2xl tracking-tight">Check your email</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We&rsquo;ve sent a verification link to{' '}
              {params.email ? (
                <span className="text-foreground font-medium">{params.email}</span>
              ) : (
                'your inbox'
              )}
              . Click it to finish setting up your account. The link is valid for 24 hours.
            </p>
          </div>
          <p
            className="text-muted-foreground auth-rise border-border border-t pt-4 text-sm leading-relaxed"
            style={{ animationDelay: '180ms' }}
          >
            Didn&rsquo;t get it? Check your spam folder, or{' '}
            <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
              sign in
            </Link>{' '}
            to request a new one from your account page.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Mode 2: verified-with-error (Better Auth appended &error=<CODE> on failure).
  // USER_NOT_FOUND gets its own copy + Sign-up CTA to avoid a re-verify dead end.
  // TOKEN_EXPIRED / INVALID_TOKEN and unknown codes fall through to the generic message.
  if (status === 'verified' && error) {
    const isMissingAccount = error === 'USER_NOT_FOUND';
    const title = isMissingAccount ? 'Account not found' : 'Link expired or invalid';
    const description = isMissingAccount
      ? "We couldn't find an account for this verification link. The account may have been deleted, so please sign up again."
      : 'This verification link has expired or has already been used. Sign in and request a new one from your account page.';
    return (
      <Card>
        <CardContent className="space-y-5 pt-1">
          <AuthMark variant="alert" className="auth-rise" />
          <div className="auth-rise space-y-2" style={{ animationDelay: '90ms' }}>
            <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
          </div>
          <div className="auth-rise" style={{ animationDelay: '180ms' }}>
            <Button
              variant="outline"
              size="lg"
              className="h-11 w-full"
              nativeButton={false}
              render={<Link href={isMissingAccount ? '/sign-up' : '/sign-in'} />}
            >
              {isMissingAccount ? 'Sign up' : 'Sign in'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Mode 3: verified success (no error param) — the brand moment.
  if (status === 'verified') {
    const safeNext = safeNextOr(params.next ?? null, '/account');
    return (
      <Card>
        <CardContent className="space-y-6 pt-1">
          <AuthMark variant="success" className="auth-rise auth-check" />
          <div className="auth-rise space-y-3" style={{ animationDelay: '90ms' }}>
            <h1 className="font-serif text-3xl leading-tight tracking-tight">
              Your email is verified
            </h1>
            {/* Vermilion editorial tick — decorative, the one earned brand accent. */}
            <div className="bg-accent auth-tick h-[3px] w-8 rounded-full" aria-hidden />
            <p className="text-muted-foreground text-sm leading-relaxed">
              You&rsquo;re all set. You can now place orders and open a shop of your own.
            </p>
          </div>
          <div className="auth-rise" style={{ animationDelay: '180ms' }}>
            <Button
              size="lg"
              className="h-11 w-full"
              nativeButton={false}
              render={<Link href={safeNext} />}
            >
              Continue to your account
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fallback: direct navigation without a status param.
  return (
    <Card>
      <CardContent className="space-y-5 pt-1">
        <AuthMark variant="mail" className="auth-rise" />
        <div className="auth-rise space-y-2" style={{ animationDelay: '90ms' }}>
          <h1 className="font-serif text-2xl tracking-tight">Verify your email</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Sign up or sign in to receive a verification link.
          </p>
        </div>
        <div className="auth-rise" style={{ animationDelay: '180ms' }}>
          <Button
            size="lg"
            className="h-11 w-full"
            nativeButton={false}
            render={<Link href="/sign-in" />}
          >
            Sign in
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
