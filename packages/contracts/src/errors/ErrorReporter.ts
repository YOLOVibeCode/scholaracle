/**
 * Seam for external error telemetry (Sentry, etc.).
 *
 * Services call `setErrorReporter` once at startup; everything else uses
 * `getErrorReporter()`. Defaults to a no-op so tests and unconfigured
 * environments never need wiring.
 */
export interface IErrorReporter {
  captureException(error: unknown, context?: Record<string, unknown>): void;
  captureMessage(message: string, context?: Record<string, unknown>): void;
}

export class NoopErrorReporter implements IErrorReporter {
  captureException(): void {
    // intentionally empty
  }

  captureMessage(): void {
    // intentionally empty
  }
}

let currentReporter: IErrorReporter = new NoopErrorReporter();

export function setErrorReporter(reporter: IErrorReporter): void {
  currentReporter = reporter;
}

export function getErrorReporter(): IErrorReporter {
  return currentReporter;
}
