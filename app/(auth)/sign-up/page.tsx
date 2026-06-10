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

// Render dynamically so `googleAuthEnabled` is read from the running server's
// env at request time, not frozen at build. See the sign-in page for the full
// rationale (CI build env has no GOOGLE_* creds, so static prerender would bake
// the Google button hidden in prod).
export const dynamic = 'force-dynamic';

// SignUpForm reads the `next` query param via useSearchParams() — same
// CSR-bailout-during-prerender pattern as the sign-in page.
//
// T4 showcase-first framing: artist-intent arrivals (from the "Share your
// work" entry points, ?intent=seller — internal analytics value) get copy
// about showing work, with selling framed as optional. Everyone else gets
// the discover-or-share line.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  const artistIntent = intent === 'seller';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl">Create your account</CardTitle>
        <CardDescription>
          {artistIntent
            ? 'Open a studio, show your work the way a gallery would — and sell it if you want to.'
            : 'Join Balikha to discover handmade work, or share your own.'}
        </CardDescription>
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
