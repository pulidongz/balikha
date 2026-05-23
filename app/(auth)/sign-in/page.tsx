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
