export * from './config';
export * from './fixture-adapter';
export * from './adapter';
export * from './adapter-registry';
export * from './fixture-adapter-wrapper';
export * from './canvas';

// Re-export adapters and clients from additional providers.
// Transformers/types are accessed via deep imports (e.g. '@scholaracle/connector/google-classroom')
// to avoid name collisions between adapters that share function names like transformCourseToOp.
export { GoogleClassroomAdapter, GoogleClassroomClient } from './google-classroom';
export type {
  IGoogleCourse,
  IGoogleCourseWork,
  IGoogleStudentSubmission,
  IGoogleCourseStudent,
  IGoogleClassroomClientConfig,
} from './google-classroom';
export { SkywardAdapter, SkywardClient } from './skyward';
export type {
  ISkywardScraper,
  ISkywardReport,
  ISkywardGradebook,
  ISkywardSchoolYear,
  ISkywardClientConfig,
  SkywardScraperFactory,
} from './skyward';
export { AeriesAdapter, AeriesClient } from './aeries';
export type {
  IAeriesClientConfig,
  IAeriesSchool,
  IAeriesStudent,
  IAeriesReportCard,
  IAeriesReportCardCourse,
  IAeriesMarkingPeriodGrade,
  IAeriesMarkingPeriod,
  IAeriesGpa,
  IAeriesClassScheduleEntry,
  IAeriesCourse,
  IAeriesSection,
  IAeriesSectionStaff,
  IAeriesGradebook,
  IAeriesAssignment,
  IAeriesAssignmentScore,
  IAeriesGradebookStudent,
} from './aeries';
export { OneRosterAdapter, OneRosterClient } from './oneroster';
export {
  reconcileCourse,
  reconcileCourses,
  groupBySubject,
  mergeCourses,
  titleSimilarity,
} from './reconciliation';
export type {
  SubjectArea,
  SubjectSubArea,
  IReconciledSubject,
  IReconciledCourse,
  ISourceCourse,
  IMergedCourse,
} from './reconciliation';
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
