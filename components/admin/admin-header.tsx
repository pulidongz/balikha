import Link from 'next/link';

// Navy header + red "admin" badge is a deliberate safety signal — it makes
// "I'm in admin mode" unmistakable at a glance, preventing the "I deleted a
// product, oh no I was logged in as admin not as a seller" class of mistake.
// Don't harmonize with the rest of the chrome; the visual distinctness is
// the point.
export function AdminHeader({ userName }: { userName: string }) {
  return (
    <header className="bg-foreground text-primary-foreground sticky top-0 z-30 border-b">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-serif text-lg tracking-tight">
            balikha
          </Link>
          <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-[0.65rem] font-medium tracking-widest uppercase">
            admin
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="opacity-80 hover:opacity-100">
            Back to dashboard
          </Link>
          <span className="opacity-60">{userName}</span>
        </div>
      </div>
    </header>
  );
}
