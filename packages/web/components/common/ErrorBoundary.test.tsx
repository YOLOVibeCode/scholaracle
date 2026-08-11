/**
 * @jest-environment jsdom
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('render exploded');
  }
  return <div>all good</div>;
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // React logs caught boundary errors; keep test output clean.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('renders the default fallback when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByTestId('button-error-retry')).toBeInTheDocument();
  });

  it('calls onError with the thrown error', () => {
    const onError = jest.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('render exploded');
  });

  it('supports a render-prop fallback with reset', () => {
    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <div>
            <span>custom: {error.message}</span>
            <button onClick={reset}>reset-now</button>
          </div>
        )}
      >
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('custom: render exploded')).toBeInTheDocument();
    fireEvent.click(screen.getByText('reset-now'));
    // After reset the child re-renders and throws again -> fallback returns.
    expect(screen.getByText('custom: render exploded')).toBeInTheDocument();
  });
});
