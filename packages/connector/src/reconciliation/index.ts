export {
  reconcileCourse,
  reconcileCourses,
  groupBySubject,
  type SubjectArea,
  type SubjectSubArea,
  type IReconciledSubject,
  type IReconciledCourse,
} from './subject-reconciler';

export {
  mergeCourses,
  titleSimilarity,
  type ISourceCourse,
  type IMergedCourse,
} from './course-reconciler';

export {
  reconcileAssignments,
  type MatchStrategy,
  type MatchConfidence,
  type IAssignmentForReconciliation,
  type IAssignmentMatch,
} from './assignment-reconciler';

export { multiSignalMatch, type IMultiSignalMatch } from './multi-signal-matcher';

export {
  TitleScorer,
  PointsScorer,
  DateScorer,
  CategoryScorer,
  SequenceScorer,
  type ISignalScorer,
  type IMatchSignal,
} from './signal-scorers';
