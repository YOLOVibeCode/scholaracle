'use client';

import { useEffect } from 'react';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { reportClientError } from '@/lib/errors/reporting';
import { isDevBuild } from '@/lib/errors/types';

interface IErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * Route-segment error boundary for the whole app. Any uncaught render/data
 * error below the root layout lands here instead of Next's default screen.
 * `error.digest` is Next's server-side correlation hash — always shown so
 * users can report it.
 */
export default function ErrorPage({ error, reset }: IErrorPageProps) {
  useEffect(() => {
    reportClientError(error, { digest: error.digest, boundary: 'app/error' });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <ErrorDisplay
          error={
            isDevBuild
              ? error.message
              : 'Something went wrong. Please try again — if the problem persists, contact support.'
          }
          title="Something went wrong"
          onRetry={reset}
          requestId={error.digest}
          details={isDevBuild ? error.stack : undefined}
        />
      </div>
    </div>
  );
}
