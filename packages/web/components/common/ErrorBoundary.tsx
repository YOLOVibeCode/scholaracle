'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { reportClientError } from '@/lib/errors/reporting';
import { isDevBuild } from '@/lib/errors/types';

export interface IErrorBoundaryProps {
  readonly children: ReactNode;
  /** Custom fallback: static node or render-prop receiving (error, reset). */
  readonly fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface IErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Reusable React error boundary. Catches render/lifecycle throws in its
 * subtree, reports them, and renders a fallback with a retry that resets the
 * boundary. Wrap widgets that should fail independently of the page.
 */
export class ErrorBoundary extends Component<IErrorBoundaryProps, IErrorBoundaryState> {
  public override state: IErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): IErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportClientError(error, { componentStack: errorInfo.componentStack });
    this.props.onError?.(error, errorInfo);
  }

  private readonly _reset = (): void => {
    this.setState({ error: null });
  };

  public override render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }

    const { fallback } = this.props;
    if (typeof fallback === 'function') {
      return fallback(error, this._reset);
    }
    if (fallback !== undefined) {
      return fallback;
    }

    return (
      <ErrorDisplay
        error={isDevBuild ? error.message : 'Something went wrong displaying this section.'}
        title="Something went wrong"
        onRetry={this._reset}
      />
    );
  }
}
