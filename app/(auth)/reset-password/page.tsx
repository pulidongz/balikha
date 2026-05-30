import { Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ResetPasswordForm } from '@/app/(auth)/reset-password/reset-password-form';

export const metadata = {
  title: 'Reset password',
};

// Thin wrapper: the form owns the heading so an expired-link dead-end replaces
// the form context cleanly instead of stacking under a contradictory header.
export default function ResetPasswordPage() {
  return (
    <Card>
      <CardContent className="px-6 py-4">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
