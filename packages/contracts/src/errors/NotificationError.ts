/**
 * Base error class for notification-related errors.
 */
export class NotificationError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'NotificationError';
    this.code = code;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}
