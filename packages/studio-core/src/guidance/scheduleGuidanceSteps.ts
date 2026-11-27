import type { IGuidanceJobData, LadderStep } from '@scholaracle/interfaces';
import { atLocalHourOnCalendarDay } from './zonedTime';

const HOUR_MS = 60 * 60 * 1000;
const LOCAL_SEND_HOUR = 16;
/** How long the last reminder stays worth sending when its job runs late. */
const LAST_STEP_HOURS = 24;

export interface IScheduledGuidanceStep {
  readonly step: LadderStep;
  readonly scheduledFor: Date;
}

/** The ladder's reminders, in the order they go out. */
export const LADDER_STEPS: readonly LadderStep[] = ['t48h', 't18h', 't12h', 't72h'];

const OFFSETS: Readonly<Record<LadderStep, { hoursUntilDue: number; snapToFour: boolean }>> = {
  t48h: { hoursUntilDue: 48, snapToFour: true },
  t18h: { hoursUntilDue: 18, snapToFour: true },
  t12h: { hoursUntilDue: -12, snapToFour: false },
  t72h: { hoursUntilDue: -72, snapToFour: false },
};

/**
 * When a reminder goes out. The two before the deadline go at 4 pm local (after school) on
 * the calendar day that is 48 and 18 hours before it, so between 56 and 32, and between 26
 * and 2, hours ahead. The two after go 12 and 72 hours after it, to the minute.
 *
 * The scheduler queues a job for this time and the ladder checks a job against this time.
 * It is the one place the time is worked out. When each side worked it out for itself they
 * disagreed: the first reminder only went out for work due at about 4 pm, the second only
 * for work due at about 10 am, and neither for an 11:59 pm deadline.
 */
export function ladderFireTime(step: LadderStep, dueAt: Date, timezone: string): Date {
  const offset = OFFSETS[step];
  const raw = new Date(dueAt.getTime() - offset.hoursUntilDue * HOUR_MS);
  return offset.snapToFour ? atLocalHourOnCalendarDay(raw, timezone, LOCAL_SEND_HOUR) : raw;
}

/**
 * When a reminder is no longer worth sending (a job can run late: the workers were
 * restarting, or it was held through quiet hours). Each one lasts until the next one is due;
 * the last one before the deadline lasts until the deadline, so "due soon" is never said
 * about work that is already late.
 */
export function ladderStepEnd(step: LadderStep, dueAt: Date, timezone: string): Date {
  if (step === 't48h') return ladderFireTime('t18h', dueAt, timezone);
  if (step === 't18h') return dueAt;
  if (step === 't12h') return ladderFireTime('t72h', dueAt, timezone);
  return new Date(ladderFireTime('t72h', dueAt, timezone).getTime() + LAST_STEP_HOURS * HOUR_MS);
}

/**
 * The two reminders that go out after the deadline. They say the work is missing, so the
 * ladder sends them only once the portal has marked it missing.
 */
export function isAfterDeadline(step: LadderStep): boolean {
  return OFFSETS[step].hoursUntilDue < 0;
}

/**
 * The reminders a sync queues for an assignment, and when each is to run.
 *
 * One still to come runs at its time. One before the deadline whose time has passed is left
 * out: a sync does not send "due Thursday" late. One after the deadline whose time has
 * passed runs now, for as long as it is the current one. Those two wait for the portal to
 * mark the work missing, and a sync that comes late is the first to see that it has.
 */
export function scheduleGuidanceSteps(
  now: Date,
  dueAt: Date,
  timezone: string
): readonly IScheduledGuidanceStep[] {
  const out: IScheduledGuidanceStep[] = [];
  for (const step of LADDER_STEPS) {
    const fireAt = ladderFireTime(step, dueAt, timezone);
    if (fireAt.getTime() > now.getTime()) {
      out.push({ step, scheduledFor: fireAt });
    } else if (
      isAfterDeadline(step) &&
      now.getTime() < ladderStepEnd(step, dueAt, timezone).getTime()
    ) {
      out.push({ step, scheduledFor: now });
    }
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
