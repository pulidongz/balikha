'use client';

import { SegmentError } from '@/components/layout/segment-error';

export default function AdminError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError {...props} title="The admin surface hit a snag." />;
}
