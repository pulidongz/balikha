'use client';

import { SegmentError } from '@/components/layout/segment-error';

export default function AccountError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError {...props} title="Your account page hit a snag." />;
}
