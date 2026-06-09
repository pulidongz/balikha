import { Suspense } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SignInForm } from '@/components/auth/sign-in-form';
import { googleAuthEnabled } from '@/lib/auth';

export const metadata = {
  title: 'Sign in',
};

// `googleAuthEnabled` is derived from runtime env (GOOGLE_CLIENT_ID/SECRET),
// which live in production.env and are absent from the CI build env. Static
// prerendering would bake `googleEnabled: false` into the artifact at build
// time, hiding the Google button in prod even when the server has the creds.
// Rendering dynamically evaluates the flag at request time from the running
// server's env — and keeps the documented rollback honest (clearing the creds
// hides the button AND disables the provider together).
export const dynamic = 'force-dynamic';

// SignInForm reads the `next` query param via useSearchParams(), which
// forces the form into a CSR bailout during prerendering. Suspense
// boundary tells Next that's expected and lets the rest of the page
// stay statically prerenderable.
export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your Balikha account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <SignInForm googleEnabled={googleAuthEnabled} />
        </Suspense>
      </CardContent>
      <CardFooter>
        <p className="text-muted-foreground text-sm">
          New to Balikha?{' '}
          <Link href="/sign-up" className="text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
