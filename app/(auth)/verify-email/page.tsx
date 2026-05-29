import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Check your email</CardTitle>
          <CardDescription>
            We&rsquo;ve sent a verification link to{' '}
            {params.email ? <span className="text-foreground">{params.email}</span> : 'your inbox'}.
            Click the link to finish creating your account. The link is valid for 24 hours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Didn&rsquo;t get it? Check your spam folder, or{' '}
            <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
              sign in
            </Link>{' '}
            and request a new one from your account page.
          </p>
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground text-sm">
            Already verified?{' '}
            <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  // Mode 2: verified-with-error (Better Auth appended &error=<CODE> on failure).
  // ★ Round-2 (Issue 8): USER_NOT_FOUND (deleted/recreated account) is NOT
  // "expired or already used" — give it its own copy and a Sign-up CTA so we
  // don't loop the user back into a re-verify dead end. TOKEN_EXPIRED /
  // INVALID_TOKEN (the 99% case) and any unknown future code fall through to
  // the default expired/used message. (Codes: email-verification.mjs:163-164,172.)
  if (status === 'verified' && error) {
    const isMissingAccount = error === 'USER_NOT_FOUND';
    const title = isMissingAccount ? 'Account not found' : 'Link expired or invalid';
    const description = isMissingAccount
      ? "We couldn't find an account for this verification link. The account may have been deleted — please sign up again."
      : 'This verification link has expired or has already been used. Sign in and request a new one from your account page.';
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="lg"
            className="h-11 w-full"
            render={<Link href={isMissingAccount ? '/sign-up' : '/sign-in'} />}
          >
            {isMissingAccount ? 'Sign up' : 'Sign in'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Mode 3: verified success (no error param).
  if (status === 'verified') {
    const safeNext = safeNextOr(params.next ?? null, '/account');
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Your email is verified</CardTitle>
          <CardDescription>You can now place orders and become a seller.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="lg" className="h-11 w-full" render={<Link href={safeNext} />}>
            Continue to your account
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Fallback: direct navigation without a status param.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl">Verify your email</CardTitle>
        <CardDescription>Sign up or sign in to receive a verification link.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="lg" className="h-11 w-full" render={<Link href="/sign-in" />}>
          Sign in
        </Button>
      </CardContent>
    </Card>
  );
}
