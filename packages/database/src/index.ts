// User models
export * from './models/User';
export * from './models/OAuthAccount';
export * from './models/Student';
export * from './models/Alert';

// Admin models
export * from './models/AdminUser';
export * from './models/Subscription';
export * from './models/Payment';
export * from './models/Coupon';
export * from './models/CommunicationLog';
export * from './models/CommunicationTemplate';
export * from './models/CommunicationBatch';
export * from './models/AuditLog';
export * from './models/AdminNote';
export * from './models/AgendaOverride';

// Connector / ingestion models
export * from './models/IngestDeviceAuth';
export * from './models/ConnectorDevice';
export * from './models/IngestSource';
export * from './models/IngestRun';
export * from './models/PortalAccount';
export * from './models/SlcBinding';
export * from './models/RepairCandidate';
export * from './models/ExternalIdAlias/ExternalIdAlias';

// Repositories
export * from './repositories/UserRepository';
export * from './repositories/StudentRepository';
export * from './repositories/AlertRepository';
export * from './repositories/AdminUserRepository';
export * from './repositories/AuditLogRepository';
export * from './repositories/AdminNoteRepository';
export * from './repositories/SubscriptionRepository';
export * from './repositories/PaymentRepository';
export * from './repositories/CommunicationLogRepository';
export * from './repositories/CommunicationTemplateRepository';
export * from './repositories/CommunicationBatchRepository';
export * from './repositories/AgendaOverrideRepository';
export * from './repositories/CourseTutorialOverrideRepository';
export * from './repositories/CouponRepository';
export * from './repositories/SmsDigestPendingRepository';
export * from './repositories/EmailDigestPendingRepository';
export * from './repositories/AiUsageRepository';
export * from './repositories/WebhookEventRepository';
export * from './repositories/SmsConsentRepository';
export * from './repositories/ServerAiConsentRepository';
export * from './repositories/SmsContactOptInInviteRepository';

// Connector / ingestion repositories
export * from './repositories/IngestDeviceAuthRepository';
export * from './repositories/ConnectorDeviceRepository';
export * from './repositories/IngestSourceRepository';
export * from './repositories/IngestRunRepository';
export * from './repositories/PortalAccountRepository';
export * from './repositories/SlcBindingRepository';
export * from './repositories/RepairCandidateRepository';
export * from './repositories/RepairProposalRepository';
export * from './repositories/ServedSelectorPatchRepository';
export * from './repositories/SourceInviteRepository';
export * from './repositories/ExternalIdAliasRepository/ExternalIdAliasRepository';

// Helpers (semester / term filtering)
export { getCurrentSemesterStart } from './helpers/getCurrentSemesterStart';

// Auth
export * from './repositories/PasswordResetTokenRepository';
export * from './repositories/RefreshTokenRepository';
export * from './repositories/AdminRevokedTokenRepository';
export * from './repositories/AdminPasswordResetTokenRepository';
export * from './repositories/AdminMFATokenRepository';
export * from './repositories/AdminStepUpChallengeRepository';
export * from './repositories/SessionRepository';
export * from './repositories/OAuthAccountRepository';
export * from './repositories/StudentMagicTokenRepository';
export * from './repositories/MagicLoginTokenRepository';

export { createIndexes } from './indexes';

export {
  ACCOUNT_DELETION_AUDIT_COLLECTION,
  EXTRA_USER_SCOPED_JOB_FILTER,
  STUDENT_SCOPED_DELETION_COLLECTIONS,
  USER_SCOPED_DELETION_TARGETS,
  type UserScopedDeletionTarget,
} from './accountDeletion/accountDeletionCollections';
