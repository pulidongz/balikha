'use client';

import '@/styles/tokens.css';
import './globals.css';
import styles from './global-error.module.css';

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className={styles.body}>
        <main className={styles.container}>
          <h1 className={styles.title}>Something went very wrong</h1>
          <p className={styles.description}>
            The application failed to render. This is usually temporary.
          </p>
          <button type="button" onClick={unstable_retry} className={styles.button}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
