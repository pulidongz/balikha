import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AuthStatus } from '@/components/auth/auth-status';
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
        <CardContent className="px-6 py-4">
          <AuthStatus
            mark="mail"
            title="Check your email"
            description={
              <>
                We&rsquo;ve sent a verification link to{' '}
                {params.email ? (
                  <span className="text-foreground font-medium">{params.email}</span>
                ) : (
                  'your inbox'
                )}
                . Click it to finish setting up your account. The link is valid for 24 hours.
              </>
            }
            footer={
              <>
                Didn&rsquo;t get it? Check your spam folder, or{' '}
                <Link
                  href="/sign-in"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  sign in
                </Link>{' '}
                to request a new one.
              </>
            }
          />
        </CardContent>
      </Card>
    );
  }

  // Mode 2: verified-with-error (Better Auth appended &error=<CODE> on failure).
  // USER_NOT_FOUND gets its own copy + Sign-up CTA to avoid a re-verify dead end.
  // TOKEN_EXPIRED / INVALID_TOKEN and unknown codes fall through to the generic message.
  if (status === 'verified' && error) {
    const isMissingAccount = error === 'USER_NOT_FOUND';
    return (
      <Card>
        <CardContent className="px-6 py-4">
          <AuthStatus
            mark="alert"
            title={isMissingAccount ? 'Account not found' : 'Link expired or invalid'}
            description={
              isMissingAccount
                ? "We couldn't find an account for this verification link. The account may have been deleted, so please sign up again."
                : 'This verification link has expired or has already been used. Sign in and request a new one from your account page.'
            }
            action={
              <Button
                variant="outline"
                size="lg"
                className="h-11 w-full"
                nativeButton={false}
                render={<Link href={isMissingAccount ? '/sign-up' : '/sign-in'} />}
              >
                {isMissingAccount ? 'Sign up' : 'Sign in'}
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  // Mode 3: verified success (no error param) — the brand moment.
  if (status === 'verified') {
    const safeNext = safeNextOr(params.next ?? null, '/account');
    return (
      <Card>
        <CardContent className="px-6 py-4">
          <AuthStatus
            mark="success"
            celebrate
            large
            title="Your email is verified"
            description="You're all set. You can now place orders and open a studio of your own."
            action={
              <Button
                size="lg"
                className="h-11 w-full"
                nativeButton={false}
                render={<Link href={safeNext} />}
              >
                Continue to your account
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  // Fallback: direct navigation without a status param.
  return (
    <Card>
      <CardContent className="px-6 py-4">
        <AuthStatus
          mark="mail"
          title="Verify your email"
          description="Sign up or sign in to receive a verification link."
          action={
            <Button
              size="lg"
              className="h-11 w-full"
              nativeButton={false}
              render={<Link href="/sign-in" />}
            >
              Sign in
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
