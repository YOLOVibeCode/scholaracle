import type { LadderStep } from './IGuidanceLadder';

/** Payload for a MongoQueue job of type `guidance`. Re-check LMS status at send time. */
export interface IGuidanceJobData {
  readonly studentId: string;
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly dueAt: string;
  readonly timezone: string;
  readonly step: LadderStep;
}
