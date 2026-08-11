/**
 * Typed API error carrying the server's standard error envelope
 * ({ success:false, error, code, requestId }) so screens can show real
 * messages and support-reference IDs instead of raw statuses.
 */

import type { IErrorResponseBody } from '@scholaracle/contracts';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly requestId?: string;

  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  /** Build from a non-ok Response, parsing the standard error envelope. */
  static async fromResponse(res: Response, context: string): Promise<ApiError> {
    let body: Partial<IErrorResponseBody> | null = null;
    try {
      body = (await res.json()) as Partial<IErrorResponseBody>;
    } catch {
      body = null;
    }
    const message =
      typeof body?.error === 'string' && body.error.length > 0
        ? body.error
        : `${context} failed (${res.status})`;
    return new ApiError(message, res.status, body?.code, body?.requestId);
  }
}
