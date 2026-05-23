'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { signIn } from '@/lib/auth-client';

interface ContinueWithGoogleButtonProps {
  // Same-origin path the user is sent to after a successful Google sign-in.
  // The caller is responsible for validating this through safeNextOr — we
  // forward it as-is to Better Auth's signIn.social({ callbackURL }).
  next: string;
}

export function ContinueWithGoogleButton({ next }: ContinueWithGoogleButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setLoading(true);
    const result = await signIn.social({
      provider: 'google',
      callbackURL: next,
      errorCallbackURL: '/sign-in?error=oauth',
    });
    // On success the browser follows result.data.url before we get here.
    // We only reach this branch on a network/transport failure (the
    // social-sign-in POST itself failed to reach the server).
    if (result.error) {
      setLoading(false);
      setError(result.error.message ?? 'Could not start Google sign-in. Please try again.');
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 w-full"
        onClick={() => {
          void start();
        }}
        disabled={loading}
      >
        <GoogleIcon className="mr-2 size-4" />
        {loading ? 'Redirecting…' : 'Continue with Google'}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A9 9 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A9 9 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
