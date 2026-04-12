import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.description}>
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/" className={styles.link}>
        Go home
      </Link>
    </main>
  );
}
