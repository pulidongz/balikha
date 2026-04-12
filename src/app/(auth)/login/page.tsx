import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { AuthLayout } from '../AuthLayout';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect('/');
  }

  return (
    <AuthLayout heading="Sign in to Balikha">
      <LoginForm />
      <p
        style={{
          marginTop: 'var(--space-4)',
          fontSize: 'var(--text-sm)',
          color: 'var(--neutral-500)',
        }}
      >
        Don&apos;t have an account?{' '}
        <Link href="/signup" style={{ color: 'var(--brand-primary)', textDecoration: 'underline' }}>
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
