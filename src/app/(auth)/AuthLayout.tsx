import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  children: React.ReactNode;
  heading: string;
}

export function AuthLayout({ children, heading }: AuthLayoutProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.brand}>
        <div className={styles.brandContent}>
          <h1 className={styles.brandTitle}>Balikha</h1>
          <p className={styles.brandTagline}>Artisan marketplace — handcrafted pottery and more</p>
          <div className={styles.accentBar} aria-hidden="true" />
          <p className={styles.brandFootnote}>Built by artisans, for artisans.</p>
        </div>
      </div>
      <div className={styles.form}>
        <div className={styles.formContent}>
          <h2 className={styles.formHeading}>{heading}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
