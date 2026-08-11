import {
  AppError,
  ERROR_CODES,
  ValidationError,
  type IErrorResponseBody,
  type IZodErrorLike,
} from '@scholaracle/contracts';

const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';

export interface ISerializedError {
  readonly status: number;
  readonly body: IErrorResponseBody;
}

function isZodErrorLike(error: unknown): error is IZodErrorLike & Error {
  return (
    error instanceof Error &&
    error.name === 'ZodError' &&
    Array.isArray((error as unknown as IZodErrorLike).issues)
  );
}

const STATUS_TO_CODE: Record<number, string> = {
  400: ERROR_CODES.VALIDATION_ERROR,
  401: ERROR_CODES.UNAUTHENTICATED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  429: ERROR_CODES.RATE_LIMITED,
};

/**
 * Express/body-parser errors (malformed JSON, payload too large, ...) carry a
 * 4xx `status`/`statusCode`. Their messages are client-safe; honoring the
 * status avoids misreporting client mistakes as 500s.
 */
function getClientErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const candidate =
    (error as { status?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode;
  return typeof candidate === 'number' && candidate >= 400 && candidate < 500
    ? candidate
    : undefined;
}

/**
 * Map any thrown value to an HTTP status + response body.
 *
 * - `AppError` instances keep their status/code; operational messages pass
 *   through in every environment.
 * - ZodErrors become 400 VALIDATION_ERROR with per-field details.
 * - Anything else is a non-operational 500: in production the message is
 *   replaced with a generic one; outside production a `debug` block with the
 *   real name/stack/details is included.
 */
export function serializeError(
  error: unknown,
  requestId: string | undefined,
  isProduction: boolean
): ISerializedError {
  const clientStatus = getClientErrorStatus(error);

  let appError: AppError;
  if (error instanceof AppError) {
    appError = error;
  } else if (isZodErrorLike(error)) {
    appError = ValidationError.fromZod(error);
  } else if (clientStatus !== undefined) {
    appError = new AppError((error as Error).message, {
      status: clientStatus,
      code: STATUS_TO_CODE[clientStatus] ?? ERROR_CODES.VALIDATION_ERROR,
      isOperational: true,
    });
    appError.stack = (error as Error).stack;
  } else {
    const cause = error instanceof Error ? error : new Error(String(error));
    appError = new AppError(cause.message, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      isOperational: false,
      cause,
    });
    // Surface the original stack in debug output, not the wrapper's.
    appError.stack = cause.stack;
  }

  const isMasked = !appError.isOperational && isProduction;

  const body: IErrorResponseBody = {
    success: false,
    error: isMasked ? GENERIC_ERROR_MESSAGE : appError.message,
    code: appError.code,
    ...(requestId !== undefined && { requestId }),
    ...(appError.isOperational && appError.details !== undefined && { details: appError.details }),
    ...(!isProduction && {
      debug: {
        name: appError.name,
        ...(appError.stack !== undefined && { stack: appError.stack }),
        ...(appError.details !== undefined && { details: appError.details }),
      },
    }),
  };

  return { status: appError.status, body };
}
