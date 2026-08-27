import type { IGuidanceJobData, LadderStep } from '@scholaracle/interfaces';
import { atLocalHourOnCalendarDay } from './zonedTime';

const HOUR_MS = 60 * 60 * 1000;
const LOCAL_SEND_HOUR = 16;

export interface IScheduledGuidanceStep {
  readonly step: LadderStep;
  readonly scheduledFor: Date;
}

const OFFSETS: ReadonlyArray<{ step: LadderStep; hoursUntilDue: number; snapToFour: boolean }> = [
  { step: 't48h', hoursUntilDue: 48, snapToFour: true },
  { step: 't18h', hoursUntilDue: 18, snapToFour: true },
  { step: 't12h', hoursUntilDue: -12, snapToFour: false },
  { step: 't72h', hoursUntilDue: -72, snapToFour: false },
];

/**
 * Future ladder fire times for an assignment. Past windows are omitted.
 * T-48h / T-18h snap to 4pm local on that calendar day.
 */
export function scheduleGuidanceSteps(
  now: Date,
  dueAt: Date,
  timezone: string
): readonly IScheduledGuidanceStep[] {
  const out: IScheduledGuidanceStep[] = [];
  for (const offset of OFFSETS) {
    const raw = new Date(dueAt.getTime() - offset.hoursUntilDue * HOUR_MS);
    const scheduledFor = offset.snapToFour
      ? atLocalHourOnCalendarDay(raw, timezone, LOCAL_SEND_HOUR)
      : raw;
    if (scheduledFor.getTime() <= now.getTime()) continue;
    out.push({ step: offset.step, scheduledFor });
  }
  return out;
}

export function toGuidanceJobData(
  assignment: {
    readonly studentId: string;
    readonly assignmentExternalId: string;
    readonly title: string;
    readonly dueAt: Date;
    readonly timezone: string;
  },
  step: LadderStep
): IGuidanceJobData {
  return {
    studentId: assignment.studentId,
    assignmentExternalId: assignment.assignmentExternalId,
    title: assignment.title,
    dueAt: assignment.dueAt.toISOString(),
    timezone: assignment.timezone,
    step,
  };
}
