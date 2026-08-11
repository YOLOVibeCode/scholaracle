/**
 * ErrorDisplay Component (ISP)
 * 
 * Small, focused component for displaying errors with optional retry.
 * Follows Interface Segregation Principle - single responsibility.
 */

import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { isDevBuild } from '@/lib/errors/types';

export interface IErrorDisplayProps {
  readonly error: string;
  readonly title?: string;
  readonly onRetry?: () => void;
  readonly className?: string;
  /** Machine-readable error code (e.g. NOT_FOUND, NETWORK_ERROR). */
  readonly code?: string;
  /** Server correlation ID — shown so users can quote it in support requests. */
  readonly requestId?: string;
  /** Developer detail (stack, raw payload) — rendered in dev builds only. */
  readonly details?: string;
}

export function ErrorDisplay({
  error,
  title = 'Error',
  onRetry,
  className,
  code,
  requestId,
  details,
}: IErrorDisplayProps) {
  return (
    <Card className={`border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 ${className ?? ''}`}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 dark:text-red-100">{title}</h3>
            <p className="text-sm text-red-800 dark:text-red-200 mt-1">{error}</p>
            {requestId && (
              <p
                className="text-xs text-red-600 dark:text-red-400 mt-2 font-mono select-all"
                data-testid="text-error-request-id"
              >
                Reference: {requestId}
              </p>
            )}
            {isDevBuild && (code || details) && (
              <details className="mt-2 text-xs text-red-700 dark:text-red-300">
                <summary className="cursor-pointer">Developer details</summary>
                {code && <p className="mt-1 font-mono">code: {code}</p>}
                {details && (
                  <pre className="mt-1 whitespace-pre-wrap break-all font-mono">{details}</pre>
                )}
              </details>
            )}
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="mt-3 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
                data-testid="button-error-retry"
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

