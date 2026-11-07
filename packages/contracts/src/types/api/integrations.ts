/**
 * Wire contract for connector / scraper token routes.
 * Server: packages/api/src/routes/integrations/integrations.ts.
 * Each device keeps its own token; minting for one device does not revoke others.
 */

export interface IConnectorTokenMintRequest {
  readonly deviceId: string;
}

export interface IConnectorTokenResponse {
  readonly success: boolean;
  readonly token: string;
  readonly jti: string;
  readonly deviceId: string;
  readonly expiresIn: string;
}

export interface IConnectorTokenRefreshRequest {
  readonly deviceId: string;
}

export interface IConnectorTokenRevokeRequest {
  readonly deviceId: string;
}

export interface IConnectorTokenRevokeResponse {
  readonly success: boolean;
  readonly revoked: boolean;
}

/** GET /api/integrations/sync-requests/pending */
export interface IPendingSyncRequestItem {
  readonly syncRequestId: string;
  readonly studentId: string;
  readonly sourceId: string;
  readonly createdAt: string;
}

export interface IPendingSyncRequestsResponse {
  readonly success: boolean;
  readonly pending: readonly IPendingSyncRequestItem[];
}
