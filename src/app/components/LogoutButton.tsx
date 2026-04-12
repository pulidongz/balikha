'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientFetch, ApiFetchError } from '@/lib/api/client';
import styles from './LogoutButton.module.css';

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setError(null);
    setLoading(true);

    try {
      await clientFetch('/api/auth/sign-out', {
        method: 'POST',
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiFetchError) {
        setError(err.message);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleLogout} disabled={loading} className={styles.button}>
        {loading ? 'Signing out...' : 'Sign out'}
      </button>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </>
  );
}
