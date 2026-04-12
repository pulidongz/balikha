import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Balikha</h1>
        <p className={styles.tagline}>
          Artisan marketplace — handcrafted pottery and more
        </p>
      </main>
    </div>
  );
}
