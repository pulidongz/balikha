import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { userHasPassword } from '@/lib/account/credentials';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileForm } from '@/components/account/profile-form';
import { AvatarUploader } from '@/components/account/avatar-uploader';
import { SecuritySection } from '@/components/account/security-section';
import { Reveal } from '@/components/motion/reveal';

export const metadata = {
  title: 'Profile',
};

export default async function AccountProfilePage() {
  const current = await getCurrentUser();
  if (!current) redirect('/sign-in?next=/account/profile');

  // Better Auth's session.user can lag a write to user.image — read the
  // row directly so the avatar reflects the current state after upload.
  // Two independent reads keyed only on current.id — run them concurrently.
  const [[row], hasPassword] = await Promise.all([
    db
      .select({
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
      })
      .from(user)
      .where(eq(user.id, current.id))
      .limit(1),
    userHasPassword(current.id),
  ]);
  const profile = row ?? {
    firstName: current.firstName ?? '',
    lastName: current.lastName ?? null,
    name: current.name,
    email: current.email,
    emailVerified: current.emailVerified,
    image: null,
  };

  return (
    <div className="space-y-6">
      <Reveal variant="subtle">
        <header>
          <h1 className="text-headline font-serif">Profile</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your account details.</p>
        </header>
      </Reveal>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Photo</CardTitle>
          <CardDescription>A picture helps makers and buyers recognize you.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarUploader currentUrl={profile.image} userName={profile.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Details</CardTitle>
          <CardDescription>Your name as it appears across Balikha.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            defaults={{
              firstName: profile.firstName,
              lastName: profile.lastName ?? '',
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Sign-in &amp; security</CardTitle>
          <CardDescription>Update the email and password you use to sign in.</CardDescription>
        </CardHeader>
        <CardContent>
          <SecuritySection
            email={profile.email}
            emailVerified={profile.emailVerified}
            hasPassword={hasPassword}
          />
        </CardContent>
      </Card>
    </div>
  );
}
