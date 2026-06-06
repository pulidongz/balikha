'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Last-resort boundary for errors thrown in the root layout/template that
// the segment-level error boundaries can't catch. Replaces the root layout
// when active (Next 16: error.md:163), so it renders its own <html>/<body>
// and cannot rely on globals.css. Captures the error to Sentry on mount.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: '#555' }}>
          An unexpected error occurred. Please refresh the page or try again shortly.
        </p>
      </body>
    </html>
  );
}
