import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { ProfileForm } from '@/components/account/profile-form';
import { AvatarUploader } from '@/components/account/avatar-uploader';

export const metadata = {
  title: 'Profile',
};

export default async function AccountProfilePage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/profile');

  // Better Auth's session.user can lag a write to user.image — read the
  // row directly so the avatar reflects the current state after upload.
  const [row] = await db
    .select({
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(user)
    .where(eq(user.id, current.id))
    .limit(1);
  const profile = row ?? {
    firstName: current.firstName ?? '',
    lastName: current.lastName ?? null,
    name: current.name,
    email: current.email,
    image: null,
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl">Profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">Your account details.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide uppercase">Photo</h2>
        <AvatarUploader currentUrl={profile.image} userName={profile.name} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wide uppercase">Details</h2>
        <ProfileForm
          defaults={{
            firstName: profile.firstName,
            lastName: profile.lastName ?? '',
            email: profile.email,
          }}
        />
      </section>
    </div>
  );
}
