/**
 * Wire contract for GET /api/alerts-api and POST /api/alerts-api/:id/acknowledge.
 *
 * Server is source of truth: packages/api/src/routes/alerts-api/alerts-api.ts.
 */

/**
 * One alert row in GET /api/alerts-api (an array; no pagination or filters server-side).
 * The list holds alerts for every student the caller owns or has accepted a share of, trimmed
 * to the caller's own `alertTypes` for that student when set.
 */
export interface IAlertListItem {
  readonly id: string;
  readonly studentId: string;
  readonly userId: string;
  /** AlertType value, e.g. 'grade_drop'. Typed as string: the server does not constrain it. */
  readonly type: string;
  /** 'critical' | 'warning' | 'info' | 'positive' in practice; open string on the wire. */
  readonly severity: string;
  readonly message: string;
  /** Computed for the caller: acknowledgement is per person (sharing-spec §4.5). */
  readonly acknowledged: boolean;
  /** When the caller acknowledged it. */
  readonly acknowledgedAt?: string;
  readonly createdAt: string;
}

/** Response of POST /api/alerts-api/:id/acknowledge and DELETE /api/alerts-api/:id. */
export interface IAlertActionResponse {
  readonly success: boolean;
}
