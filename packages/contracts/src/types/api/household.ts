/**
 * Portal accounts and per-student source bindings (household ingest mapping).
 * Server never stores portal credentials — only metadata and binding rows.
 */

export interface ISlcPortalAccount {
  readonly portalAccountId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly portalBaseUrl: string;
  readonly institutionExternalId: string;
  readonly displayName: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface ISlcBinding {
  readonly portalAccountId: string;
  readonly studentId: string;
  readonly sourceId: string;
  readonly studentExternalId: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/** PUT /api/portal-accounts — upsert by provider + portalBaseUrl. */
export interface IPortalAccountUpsertRequest {
  readonly provider: string;
  readonly adapterId: string;
  readonly portalBaseUrl: string;
  readonly institutionExternalId: string;
  readonly displayName: string;
}

export interface IPortalAccountUpsertResponse {
  readonly portalAccount: ISlcPortalAccount;
}

/** PUT /api/portal-accounts/:portalAccountId/bindings */
export interface IPortalBindingUpsertRequest {
  readonly studentId: string;
  readonly sourceId: string;
  readonly studentExternalId: string;
}

export interface IPortalBindingUpsertResponse {
  readonly binding: ISlcBinding;
}

/** POST /api/ingest/v1/runs/:runId/envelope — missing binding. */
export const INGEST_MISSING_BINDING_CODE = 'MISSING_BINDING' as const;

export interface IIngestMissingBindingResponse {
  readonly success: false;
  readonly error: string;
  readonly code: typeof INGEST_MISSING_BINDING_CODE;
}
