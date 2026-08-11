import { ERROR_CODES } from './errorCodes';

export interface IAppErrorOptions {
  readonly status?: number;
  readonly code?: string;
  readonly isOperational?: boolean;
  readonly details?: unknown;
  readonly cause?: unknown;
}

/**
 * Base class for HTTP-mappable application errors.
 *
 * `isOperational: true` means the message is intentional and safe to show to
 * clients in any environment. Non-operational errors are masked with a
 * generic message in production.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, options: IAppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.status = options.status ?? 500;
    this.code = options.code ?? ERROR_CODES.INTERNAL_ERROR;
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
    Error.captureStackTrace(this, this.constructor);
  }
}
