'use client';

import { useEffect } from 'react';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { reportClientError } from '@/lib/errors/reporting';
import { isDevBuild } from '@/lib/errors/types';

interface IErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/** Dashboard-segment boundary: a crash here keeps the surrounding shell. */
export default function DashboardError({ error, reset }: IErrorPageProps) {
  useEffect(() => {
    reportClientError(error, { digest: error.digest, boundary: 'app/dashboard/error' });
  }, [error]);

  return (
    <div className="p-6">
      <ErrorDisplay
        error={
          isDevBuild ? error.message : 'Something went wrong loading this page. Please try again.'
        }
        title="Dashboard error"
        onRetry={reset}
        requestId={error.digest}
        details={isDevBuild ? error.stack : undefined}
      />
    </div>
  );
}
