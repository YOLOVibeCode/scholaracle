export { TodayGuide } from './TodayGuide';
export { GuidanceLadder, resolveLadderStep, isQuietHour } from './guidance/GuidanceLadder';
export type {
  ILadderAssignment,
  IGuidanceLadderDeps,
  IQuietHoursConfig,
} from './guidance/GuidanceLadder';
export { scheduleGuidanceSteps, toGuidanceJobData } from './guidance/scheduleGuidanceSteps';
export type { IScheduledGuidanceStep } from './guidance/scheduleGuidanceSteps';
export { SystemGuidanceClock } from './guidance/SystemGuidanceClock';
export { calendarDayKey, zonedLocalDate, atLocalHourOnCalendarDay } from './guidance/zonedTime';
export { WorkPack, createStaticWorkPackSource } from './WorkPack';
export { humanAssignmentStatus } from './humanAssignmentStatus';
export {
  extractDescriptionLinks,
  stripHtmlToText,
  type IDescriptionLink,
} from './descriptionLinks';
export {
  partitionMaterials,
  classifyResource,
  type IMaterialPartition,
  type IResourceLink,
  type ResourceKind,
} from './resourcePartition';
export { extractHostname, normalizeUrl, isSameNormalizedUrl, isSchoolLoginHost } from './urlHost';
export { CourseOfflinePack } from './offlinePack/CourseOfflinePack';
export type {
  ICourseOfflinePack,
  ICourseOfflinePackDeps,
  IOfflineAssetRef,
  IOfflinePackApiResponse,
  ISavedCoursePack,
  IPackStore,
} from '@scholaracle/interfaces';
export { AssetCache, assetCacheKey } from './assetCache/AssetCache';
export { AssetCacheError } from './assetCache/AssetCacheError';
export { MemoryAssetCacheStore } from './assetCache/MemoryAssetCacheStore';
export {
  DirectoryAssetCacheStore,
  type IAssetCacheFs,
} from './assetCache/DirectoryAssetCacheStore';
export { createHttpAssetFetcher } from './assetCache/HttpAssetFetcher';
export type {
  ICachedAsset,
  IAssetRef,
  IAssetCacheStore,
  IStoredCachedAsset,
} from '@scholaracle/interfaces';
export {
  EMMA_LAB_SAFETY_ASSET_ID,
  EMMA_LAB_SAFETY_HASH,
  EMMA_LAB_SAFETY_HASH_V2,
  EMMA_LAB_SAFETY_FIXTURE_URL,
  EMMA_LAB_SAFETY_FIXTURE_URL_V2,
  EMMA_LAB_SAFETY_PDF_V1,
  EMMA_LAB_SAFETY_PDF_V2,
} from './fixtures/labSafetyPdf';
export {
  EMMA_FIXTURE_SESSION,
  createEmmaFixtureSource,
  createEmmaFixtureWorkPackSource,
  loadEmmaFixtureToday,
  loadEmmaFixtureWorkPack,
} from './fixtures/emma';
