'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUp } from '@/lib/auth-client';

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function attemptSignUp() {
    setError(null);
    setLoading(true);
    const result = await signUp.email({ email, password, name });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? 'Sign-up failed');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void attemptSignUp();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="signup-name">Name</Label>
        <Input
          id="signup-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
