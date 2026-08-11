/**
 * Wire contract for POST /api/integrations/scraper-token.
 *
 * Server is source of truth: packages/api/src/routes/integrations/integrations.ts.
 * Minting REVOKES all previous scraper tokens for the user — clients must be
 * prepared to re-mint on 401 (see mobile connector-token healing).
 */

export interface IConnectorTokenResponse {
  readonly success: boolean;
  readonly token: string;
  readonly jti: string;
  readonly expiresIn: string;
}
