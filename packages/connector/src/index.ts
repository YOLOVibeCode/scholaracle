// Core infrastructure (kept for adapters that still use it)
export * from './config';
export * from './fixture-adapter';
export * from './adapter';
export * from './adapter-registry';
export * from './fixture-adapter-wrapper';

// Asset management
export {
  AssetDownloader,
  classifyAssetPriority,
  compareAssetPriority,
  DEFAULT_MAX_ASSET_DOWNLOAD_BYTES,
} from './asset-downloader';
export type {
  IAssetDownloaderConfig,
  IAssetDownloadParams,
  IAssetDownloadResult,
  IAssetCheckResult,
  AssetPriority,
} from './asset-downloader';
export { SyncState } from './sync-state';
export type { ISyncStateEntry } from './sync-state';
export { probeLinkAccessibility, probeLinkAccessibilityBatch } from './link-probe';
export type { LinkAccessibility } from './link-probe';

// API-based adapters (still active — have API access)
export { CanvasAdapter, CanvasClient } from './canvas';
export type {
  ICanvasCourse,
  ICanvasAssignment,
  ICanvasSubmission,
  ICanvasEnrollment,
  ICanvasClientConfig,
} from './canvas';
export { GoogleClassroomAdapter, GoogleClassroomClient } from './google-classroom';
export type {
  IGoogleCourse,
  IGoogleCourseWork,
  IGoogleStudentSubmission,
  IGoogleCourseStudent,
  IGoogleClassroomClientConfig,
} from './google-classroom';
export { OneRosterAdapter, OneRosterClient } from './oneroster';
export { SkywardAdapter, SkywardClient } from './skyward';
export type {
  ISkywardClass,
  ISkywardLineItem,
  ISkywardResult,
  ISkywardEnrollment,
  ISkywardClientConfig,
} from './skyward';
export type {
  IOneRosterOrg,
  IOneRosterCourse,
  IOneRosterClass,
  IOneRosterLineItem,
  IOneRosterResult,
  IOneRosterAcademicSession,
  IOneRosterCategory,
  IOneRosterClientConfig,
} from './oneroster';

// AI client (used by server-side Skyward scraper for strategy store)
export { createAiClient } from './ai/create-ai-client';
export type { AiProvider } from './ai/create-ai-client';

// Strategy (MongoStrategyStore for server, types from contracts)
export { MongoStrategyStore } from './strategy';
export { useStrategy, computeFingerprint } from './strategy';
export type {
  IExtractionStrategy,
  ISelectorStep,
  IStrategyAttempt,
  IStrategyStore,
} from './strategy';

// Reconciliation (used by ingest API)
export {
  reconcileCourse,
  reconcileCourses,
  groupBySubject,
  mergeCourses,
  titleSimilarity,
  reconcileAssignments,
} from './reconciliation';
export type {
  SubjectArea,
  SubjectSubArea,
  IReconciledSubject,
  IReconciledCourse,
  ISourceCourse,
  IMergedCourse,
  MatchStrategy,
  MatchConfidence,
  IAssignmentForReconciliation,
  IAssignmentMatch,
} from './reconciliation';
