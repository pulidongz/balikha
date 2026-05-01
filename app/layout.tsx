import type { Metadata } from 'next';
import { Geist, Geist_Mono, Fraunces } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

const fraunces = Fraunces({
  variable: '--font-serif',
  subsets: ['latin'],
  // Used sparingly per plan §3: product titles on detail pages, artisan
  // names on cards, hero copy. Reserve weight 400/500.
  weight: ['400', '500'],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Balikha — Artisan marketplace',
    template: '%s · Balikha',
  },
  description:
    'Discover and buy handmade work from independent artisans. Pottery, textiles, prints, and more.',
  openGraph: {
    type: 'website',
    siteName: 'Balikha',
    url: APP_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
