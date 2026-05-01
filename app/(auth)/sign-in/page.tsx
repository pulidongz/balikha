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

export const metadata = {
  title: 'Sign in · Balikha',
};

export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to your Balikha account.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm />
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
