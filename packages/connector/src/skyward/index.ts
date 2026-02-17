export { SkywardAdapter, type SkywardScraperFactory } from './skyward-adapter';
export { SkywardClient } from './skyward-client';
export type {
  ISkywardScraper,
  ISkywardExtendedScraper,
  ISkywardReport,
  ISkywardReportScore,
  ISkywardAssignment,
  ISkywardAssignmentMeta,
  ISkywardGradebook,
  ISkywardGradebookCategory,
  ISkywardSchoolYear,
  ISkywardHistoryCourse,
  ISkywardClientConfig,
  ISkywardAttendanceRecord,
  ISkywardScheduleEntry,
  ISkywardMessage,
  ISkywardDocument,
} from './skyward-client';
export {
  mapSkywardAssignmentStatus,
  transformSkywardAssignmentToOp,
  transformReportToGradeOps,
  transformGradebookToAssignmentOps,
  transformSkywardCourseToOp,
  reconcileSkywardCourse,
  transformAttendanceToOp,
  transformScheduleToTeacherOp,
  transformDocumentToOp,
  transformMessageToOp,
} from './skyward-transformer';
