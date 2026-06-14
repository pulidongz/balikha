import { EmailChangeForm } from '@/components/account/email-change-form';
import { PasswordChangeForm } from '@/components/account/password-change-form';
import { SetPasswordForm } from '@/components/account/set-password-form';

interface Props {
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
}

// Composes the account-security controls inside the Sign-in & security card.
// Two subsections (Email, Password) split by a hairline divider — NOT nested
// cards, which the card itself already provides containment for. Server
// component: it only branches on hasPassword and forwards props to the client
// forms, so no client JS ships for the layout itself.
export function SecuritySection({ email, emailVerified, hasPassword }: Props) {
  return (
    <div>
      <section className="space-y-3">
        <h3 className="font-medium">Email</h3>
        <EmailChangeForm currentEmail={email} emailVerified={emailVerified} />
      </section>

      <section className="border-border mt-6 space-y-3 border-t pt-6">
        <h3 className="font-medium">Password</h3>
        {hasPassword ? <PasswordChangeForm /> : <SetPasswordForm />}
      </section>
    </div>
  );
}
