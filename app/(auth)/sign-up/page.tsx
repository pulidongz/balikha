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
import { SignUpForm } from '@/components/auth/sign-up-form';
import { googleAuthEnabled } from '@/lib/auth';

export const metadata = {
  title: 'Create account',
};

// SignUpForm reads the `next` query param via useSearchParams() — same
// CSR-bailout-during-prerender pattern as the sign-in page.
export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl">Create your account</CardTitle>
        <CardDescription>Join Balikha to discover or sell artisan work.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <SignUpForm googleEnabled={googleAuthEnabled} />
        </Suspense>
      </CardContent>
      <CardFooter>
        <p className="text-muted-foreground text-sm">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
