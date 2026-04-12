import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { AuthLayout } from '../AuthLayout';
import { SignupForm } from './SignupForm';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect('/');
  }

  return (
    <AuthLayout heading="Create your account">
      <SignupForm />
      <p
        style={{
          marginTop: 'var(--space-4)',
          fontSize: 'var(--text-sm)',
          color: 'var(--neutral-500)',
        }}
      >
        Already have an account?{' '}
        <Link href="/login" style={{ color: 'var(--brand-primary)', textDecoration: 'underline' }}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
