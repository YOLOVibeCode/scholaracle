import type {
  IAssignmentState,
  IGuidanceClock,
  IGuidanceSendLog,
  INotificationSink,
  LadderStep,
} from '@scholaracle/interfaces';

export interface IQuietHoursConfig {
  readonly start: string;
  readonly end: string;
}

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

const HOUR_MS = 60 * 60 * 1000;
const STEP_TOLERANCE_HOURS = 0.51;
const LOCAL_SEND_HOUR = 16;
const MAX_STUDENT_DEFAULT = 2;

function hoursUntilDue(now: Date, dueAt: Date): number {
  return (dueAt.getTime() - now.getTime()) / HOUR_MS;
}

export function resolveLadderStep(now: Date, dueAt: Date): LadderStep | null {
  const hours = hoursUntilDue(now, dueAt);
  if (Math.abs(hours - 48) <= STEP_TOLERANCE_HOURS) return 't48h';
  if (Math.abs(hours - 18) <= STEP_TOLERANCE_HOURS) return 't18h';
  if (Math.abs(hours + 12) <= STEP_TOLERANCE_HOURS) return 't12h';
  if (Math.abs(hours + 72) <= STEP_TOLERANCE_HOURS) return 't72h';
  return null;
}

function parseHour(hhmm: string): number {
  const hour = Number(hhmm.slice(0, 2));
  return Number.isFinite(hour) ? hour : 0;
}

export function isQuietHour(localHour: number, quietHours?: IQuietHoursConfig): boolean {
  if (quietHours === undefined) return false;
  const start = parseHour(quietHours.start);
  const end = parseHour(quietHours.end);
  if (start === end) return false;
  if (start < end) return localHour >= start && localHour < end;
  return localHour >= start || localHour < end;
}

function dueWeekday(dueAt: Date, timezone: string): string {
  return dueAt.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
}

function studentDeepLink(assignmentExternalId: string): string {
  return `/studio/assignments/${assignmentExternalId}`;
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

  public async evaluate(assignment: ILadderAssignment): Promise<void> {
    const status = await this._state.status(assignment.studentId, assignment.assignmentExternalId);
    if (status === 'submitted' || status === 'graded') {
      return;
    }

    const step = resolveLadderStep(this._clock.now(), assignment.dueAt);
    if (step === null) {
      return;
    }

    if (await this._log.alreadySent(assignment.studentId, assignment.assignmentExternalId, step)) {
      return;
    }

    if (
      (step === 't48h' || step === 't18h') &&
      this._clock.localHour(assignment.timezone) !== LOCAL_SEND_HOUR
    ) {
      return;
    }

    if (isQuietHour(this._clock.localHour(assignment.timezone), this._quietHours)) {
      return;
    }

    const audiences = audiencesFor(step);
    let sentAny = false;
    for (const audience of audiences) {
      if (audience === 'student') {
        const used = await this._log.studentLadderSendsToday(assignment.studentId);
        if (used >= this._maxStudent) {
          continue;
        }
      }
      await this._sink.send({
        audience,
        studentId: assignment.studentId,
        body: copyFor(step, assignment, audience),
        deepLink:
          audience === 'student'
            ? studentDeepLink(assignment.assignmentExternalId)
            : parentDeepLink(assignment.studentId),
      });
      if (audience === 'student') {
        await this._log.recordStudentLadderSend(assignment.studentId);
      }
      sentAny = true;
    }
    if (sentAny) {
      await this._log.markSent(assignment.studentId, assignment.assignmentExternalId, step);
    }
  }
}
