'use client';

// global-error replaces the root layout when it fails, so it must render
// its own <html> and <body> and be fully self-contained. CSS Modules are
// avoided here because they rely on React context that is unavailable
// during Next.js's static prerender of /_global-error. Tokens and globals
// are imported as plain CSS so design tokens (var(--*)) resolve correctly.
import '@/styles/tokens.css';
import './globals.css';

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: 'var(--brand-bg)',
          color: 'var(--neutral-900)',
        }}
      >
        <main
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 'var(--space-8)',
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              color: 'var(--neutral-900)',
              marginBottom: 'var(--space-4)',
            }}
          >
            Something went very wrong
          </h1>
          <p
            style={{
              fontSize: 'var(--text-base)',
              color: 'var(--neutral-500)',
              marginBottom: 'var(--space-6)',
            }}
          >
            The application failed to render. This is usually temporary.
          </p>
          <button
            type="button"
            onClick={unstable_retry}
            style={{
              padding: 'var(--space-3) var(--space-6)',
              backgroundColor: 'var(--brand-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-base)',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
