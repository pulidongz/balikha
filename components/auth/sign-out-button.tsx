'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await signOut();
    setLoading(false);
    router.push('/');
    router.refresh();
  }

  return (
    <Button onClick={handleClick} disabled={loading} variant="outline">
      {loading ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
