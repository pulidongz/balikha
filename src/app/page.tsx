import Link from 'next/link';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { LogoutButton } from './components/LogoutButton';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Balikha</h1>
        <p className={styles.tagline}>Artisan marketplace — handcrafted pottery and more</p>

        {session ? (
          <p className={styles.greeting}>
            Signed in as {session.user.email}. <LogoutButton />
          </p>
        ) : (
          <p className={styles.greeting}>
            <Link href="/login" className={styles.link}>
              Sign in
            </Link>
            {' or '}
            <Link href="/signup" className={styles.link}>
              create an account
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
