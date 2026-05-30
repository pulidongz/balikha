import { Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ForgotPasswordForm } from '@/app/(auth)/forgot-password/forgot-password-form';

export const metadata = {
  title: 'Forgot password',
};

// Thin wrapper: the form owns the heading so the "sent" confirmation replaces
// the form context cleanly instead of stacking under a fixed header.
export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardContent className="px-6 py-4">
        <Suspense fallback={null}>
          <ForgotPasswordForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
