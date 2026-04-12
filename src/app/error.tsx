'use client';

import styles from './error.module.css';

export default function Error({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Something went wrong</h1>
      <p className={styles.description}>
        An unexpected error occurred. Please try again.
      </p>
      <button type="button" onClick={unstable_retry} className={styles.button}>
        Try again
      </button>
    </main>
  );
}
