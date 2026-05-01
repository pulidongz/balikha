import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="bg-secondary/30 flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="text-foreground/80 hover:text-foreground mb-8 font-serif text-2xl tracking-tight transition-colors"
      >
        Balikha
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
