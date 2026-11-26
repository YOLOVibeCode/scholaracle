export { AuthService, INVALID_CREDENTIALS_ERROR } from './AuthService/AuthService';
export type {
  IAuthService,
  IAuthResult,
  IAuthUserPayload,
  IAuthTokenPayload,
  IRegisterOptions,
  IRequestPasswordResetResult,
  IRefreshResult,
} from './AuthService/AuthService';
export type { IPasswordResetEmailSender } from './PasswordResetEmailSender';

export { AdminAuthService, tooManyWrongCodesMessage } from './AdminAuthService/AdminAuthService';
export type {
  AdminCodeCheck,
  IAdminAuthService,
  IAdminAuthResult,
  IAdminTokenPayload,
} from './AdminAuthService/AdminAuthService';

export { MFAService } from './MFAService/MFAService';
export type { IMFAService, IMFASetupResult } from './MFAService/MFAService';

export { AttemptLimiter } from './AttemptLimiter/AttemptLimiter';
export type {
  IAttemptDecision,
  IAttemptLimiter,
  IAttemptLimiterOptions,
} from './AttemptLimiter/AttemptLimiter';

export { ConnectorTokenService } from './ConnectorTokenService/ConnectorTokenService';
export type { IConnectorTokenPayload } from './ConnectorTokenService/ConnectorTokenService';

export {
  assertConnectorJwtSecretDistinctFromUserSecret,
  resolveConnectorJwtSecret,
} from './connectorJwtSecrets';

export { qrPngDataUrl } from './qrPngDataUrl';
