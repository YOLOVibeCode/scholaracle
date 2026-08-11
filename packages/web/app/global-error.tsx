'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/errors/reporting';
import { isDevBuild } from '@/lib/errors/types';

interface IGlobalErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * Last-resort boundary: catches errors thrown by the root layout itself.
 * Must render its own <html>/<body> and cannot rely on app CSS, so styles
 * are inline.
 */
export default function GlobalError({ error, reset }: IGlobalErrorProps) {
  useEffect(() => {
    reportClientError(error, { digest: error.digest, boundary: 'app/global-error' });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#fafafa',
          color: '#1a1a1a',
        }}
      >
        <div style={{ maxWidth: 480, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#555', marginBottom: 8 }}>
            {isDevBuild
              ? error.message
              : 'An unexpected error occurred. Please try again — if the problem persists, contact support.'}
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: '#999', fontFamily: 'monospace', marginBottom: 16 }}>
              Reference: {error.digest}
            </p>
          )}
          {isDevBuild && error.stack && (
            <pre
              style={{
                fontSize: 11,
                textAlign: 'left',
                overflow: 'auto',
                background: '#f0f0f0',
                padding: 12,
                borderRadius: 6,
                marginBottom: 16,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {error.stack}
            </pre>
          )}
          <button
            onClick={reset}
            style={{
              padding: '8px 20px',
              fontSize: 14,
              borderRadius: 6,
              border: '1px solid #ccc',
              background: '#fff',
              cursor: 'pointer',
            }}
            data-testid="button-global-error-retry"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
