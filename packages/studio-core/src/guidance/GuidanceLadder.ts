import type {
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSend,
  IGuidanceSendLog,
  INotificationSink,
  LadderStep,
} from '@scholaracle/interfaces';
import { quietHoursEnd, type IQuietHoursConfig } from './quietHours';
import { isAfterDeadline, ladderFireTime, ladderStepEnd } from './scheduleGuidanceSteps';

export interface ILadderAssignment {
  readonly studentId: string;
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly dueAt: Date;
  readonly timezone: string;
}

export interface IGuidanceLadderDeps {
  readonly clock: IGuidanceClock;
  readonly state: IAssignmentState;
  readonly sink: INotificationSink;
  readonly log: IGuidanceSendLog;
  readonly quietHours?: IQuietHoursConfig;
  readonly maxStudentPushesPerDay?: number;
}

/** Why a reminder job ended without anybody being told. */
export type LadderSkip =
  /** Submitted, graded or excused since the job was queued. */
  | 'closed'
  /** The portal no longer lists the assignment. */
  | 'removed'
  /** Due at another time now. The jobs queued when the due time changed speak for it. */
  | 'rescheduled'
  /** After the deadline, and the portal has not marked the work missing. */
  | 'not_missing'
  /** Before the reminder's time. */
  | 'too_early'
  /** The next reminder is due, or the work is: this one is out of date. */
  | 'too_late'
  /** Another copy of the job sent it, there is nobody to tell, or the student has had the day's limit. */
  | 'nobody_told';

/** What became of one reminder job. */
export type LadderOutcome =
  | { readonly kind: 'sent' }
  /** It fell in quiet hours. Run the job again at `until`, when they end. */
  | { readonly kind: 'held'; readonly until: Date }
  | { readonly kind: 'skipped'; readonly why: LadderSkip };

const MINUTE_MS = 60 * 1000;
const MAX_STUDENT_DEFAULT = 2;

function skipped(why: LadderSkip): LadderOutcome {
  return { kind: 'skipped', why };
}

function dueWeekday(dueAt: Date, timezone: string): string {
  return dueAt.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
}

/** The student's worksheet page. Portal ids can hold spaces and slashes, so the id is encoded. */
export function studentAssignmentPath(assignmentExternalId: string): string {
  return `/studio/assignments/${encodeURIComponent(assignmentExternalId)}`;
}

function parentDeepLink(studentId: string): string {
  return `/dashboard/students/${studentId}?board=needs_attention#action-board`;
}

function copyFor(
  step: LadderStep,
  assignment: ILadderAssignment,
  audience: 'student' | 'parent'
): string {
  if (step === 't48h') {
    return `${assignment.title} is due ${dueWeekday(assignment.dueAt, assignment.timezone)}. Open the worksheet when you have 15 min.`;
  }
  if (step === 't18h') {
    return `${assignment.title} is due soon. Open it now so it isn't last-minute.`;
  }
  if (step === 't12h' && audience === 'student') {
    return 'Still open — tap to pick it up.';
  }
  if (step === 't12h') {
    return `${assignment.title} is still missing.`;
  }
  return `${assignment.title} is still outstanding. Worth a short check-in.`;
}

function audiencesFor(step: LadderStep): readonly ('student' | 'parent')[] {
  if (step === 't48h' || step === 't18h') return ['student'];
  if (step === 't12h') return ['student', 'parent'];
  return ['parent'];
}

/**
 * Deterministic assignment reminder ladder. LLM must not decide audience.
 */
export class GuidanceLadder {
  private readonly _clock: IGuidanceClock;
  private readonly _state: IAssignmentState;
  private readonly _sink: INotificationSink;
  private readonly _log: IGuidanceSendLog;
  private readonly _quietHours?: IQuietHoursConfig;
  private readonly _maxStudent: number;

  constructor(deps: IGuidanceLadderDeps) {
    this._clock = deps.clock;
    this._state = deps.state;
    this._sink = deps.sink;
    this._log = deps.log;
    this._quietHours = deps.quietHours;
    this._maxStudent = deps.maxStudentPushesPerDay ?? MAX_STUDENT_DEFAULT;
  }

  /**
   * Runs one reminder job: `step` of `assignment`, as it was when the job was queued.
   *
   * The assignment is read again first, because days pass between a sync queueing the job
   * and the job running: the work may be turned in, taken down, or due at another time.
   * Then the clock: a job runs at the time `ladderFireTime` gave it, or later when the
   * workers were busy or it was held, and is good until `ladderStepEnd`. In quiet hours it is
   * held until they end, not dropped.
   */
  public async evaluate(assignment: ILadderAssignment, step: LadderStep): Promise<LadderOutcome> {
    const current = await this._state.current(
      assignment.studentId,
      assignment.assignmentExternalId
    );
    if (current === null) {
      return skipped('removed');
    }
    if (current.status === 'closed') {
      return skipped('closed');
    }
    // The job and the row come from the same portal record, so an unchanged due time is the
    // same instant. Any other time, or none, is a deadline that moved.
    if (current.dueAt === null || current.dueAt.getTime() !== assignment.dueAt.getTime()) {
      return skipped('rescheduled');
    }
    // After the deadline the reminders say the work is missing. That is the portal's to say:
    // work it has not marked missing may be done on paper, not marked yet, or handed in
    // since the last sync. The sync that sees it marked queues the reminder again.
    if (isAfterDeadline(step) && current.status !== 'missing') {
      return skipped('not_missing');
    }

    const now = this._clock.now();
    const fireAt = ladderFireTime(step, assignment.dueAt, assignment.timezone);
    // The queue does not hand a job out before its time. A minute's grace covers two
    // machines whose clocks differ slightly.
    if (now.getTime() < fireAt.getTime() - MINUTE_MS) {
      return skipped('too_early');
    }
    const endsAt = ladderStepEnd(step, assignment.dueAt, assignment.timezone);
    if (now.getTime() >= endsAt.getTime()) {
      return skipped('too_late');
    }

    const quietUntil = quietHoursEnd(now, assignment.timezone, this._quietHours);
    if (quietUntil !== null) {
      return quietUntil.getTime() < endsAt.getTime()
        ? { kind: 'held', until: quietUntil }
        : skipped('too_late');
    }

    let anyoneTold = false;
    for (const audience of audiencesFor(step)) {
      if (await this._tellOnce(step, assignment, audience)) {
        anyoneTold = true;
      }
    }
    return anyoneTold ? { kind: 'sent' } : skipped('nobody_told');
  }

  /**
   * Tells one audience, once, and says whether it did. Many copies of the same job run at
   * the same moment (one for each sync since the assignment appeared), so the reminder is
   * taken before it is sent and only the caller that got it sends. It is given back when
   * nobody was told: there was nobody to tell (a student with no login, say), the student
   * has had the day's two, or the send failed and the job will be tried again. A reminder
   * given back is not recorded as sent and is not one of the student's two a day.
   */
  private async _tellOnce(
    step: LadderStep,
    assignment: ILadderAssignment,
    audience: 'student' | 'parent'
  ): Promise<boolean> {
    const send: IGuidanceSend = {
      studentId: assignment.studentId,
      assignmentExternalId: assignment.assignmentExternalId,
      dueAt: assignment.dueAt,
      step,
      audience,
    };
    if (!(await this._log.claim(send))) {
      return false;
    }

    let tookOneOfTodays = false;
    let told = false;
    try {
      if (audience === 'student') {
        tookOneOfTodays = await this._log.claimStudentSendToday(
          assignment.studentId,
          this._maxStudent
        );
        if (!tookOneOfTodays) {
          return false;
        }
      }
      const { deliveries } = await this._sink.send({
        audience,
        studentId: assignment.studentId,
        body: copyFor(step, assignment, audience),
        deepLink:
          audience === 'student'
            ? studentAssignmentPath(assignment.assignmentExternalId)
            : parentDeepLink(assignment.studentId),
        assignmentExternalId: assignment.assignmentExternalId,
      });
      told = deliveries > 0;
    } finally {
      if (!told) {
        if (tookOneOfTodays) {
          await this._log.releaseStudentSendToday(assignment.studentId);
        }
        await this._log.release(send);
      }
    }
    return told;
  }
}
