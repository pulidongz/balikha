'use client';

import { SegmentError } from '@/components/layout/segment-error';

export default function StudioError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError {...props} title="This studio page hit a snag." />;
}
