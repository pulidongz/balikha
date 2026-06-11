'use client';

import { SegmentError } from '@/components/layout/segment-error';

export default function DashboardError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SegmentError {...props} title="The studio dashboard hit a snag." />;
}
