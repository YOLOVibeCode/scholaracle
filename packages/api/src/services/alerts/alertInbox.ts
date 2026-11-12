import { ObjectId } from 'mongodb';
import type { IAlertData, IAlertVisibilityScope } from '@scholaracle/interfaces';
import type { AlertRepository, Student, StudentRepository } from '@scholaracle/database';
import { ForbiddenError, NotFoundError, type IAlertListItem } from '@scholaracle/contracts';

/**
 * Alert inbox by access, acknowledgement per person (docs/sharing-spec.md §4.5).
 *
 * Alert rows carry the owner's `userId` and the student's Mongo id in `studentId` (ingest
 * writes it; ALERT_STUDENT_ID_MIGRATION rewrote legacy portal ids). A viewer sees an alert
 * when they own it or when it belongs to a student shared with them; `acknowledged` is
 * computed for the viewer from `acknowledgedBy`, with the legacy fields standing in for the
 * owner until ALERT_ACK_BY_MIGRATION has copied them.
 *
 * Fallback: a legacy row whose `studentId` could not be resolved to a student (unknown or
 * ambiguous portal id) is still visible to its owner through the owner's `userId`, without
 * an alertTypes trim; it is never visible to a shared adult.
 */

export type StoredAlert = IAlertData & { id?: string };

export interface IViewerAckState {
  readonly acknowledged: boolean;
  readonly acknowledgedAt?: string;
}

/** The students a viewer can see, indexed by owner + Mongo id (what alert rows carry). */
export class AlertAccess {
  private readonly _byKey = new Map<string, Student>();
  /** Students shared with the viewer; owned students are covered by the viewer's own rows. */
  public readonly scopes: readonly IAlertVisibilityScope[];

  constructor(students: readonly Student[], viewerUserId: string) {
    const shared: IAlertVisibilityScope[] = [];
    for (const student of students) {
      const scope = AlertAccess.scopeFor(student);
      this._byKey.set(`${scope.ownerUserId}|${scope.studentId}`, student);
      if (!student.isOwner(viewerUserId)) shared.push(scope);
    }
    this.scopes = shared;
  }

  public static scopeFor(student: Student): IAlertVisibilityScope {
    return { ownerUserId: student.dataUserId(), studentId: student._id?.toString() ?? '' };
  }

  /** The accessible student an alert row belongs to, if any. */
  public studentFor(alert: Pick<IAlertData, 'userId' | 'studentId'>): Student | undefined {
    return this._byKey.get(`${alert.userId}|${alert.studentId}`);
  }
}

/** Acknowledgement as seen by one person. Legacy fields count for the owner only. */
export function ackStateFor(alert: IAlertData, viewerUserId: string): IViewerAckState {
  const mine = alert.acknowledgedBy?.[viewerUserId];
  if (typeof mine === 'string' && mine !== '') {
    return { acknowledged: true, acknowledgedAt: mine };
  }
  if (alert.userId === viewerUserId && alert.acknowledged === true) {
    return { acknowledged: true, acknowledgedAt: alert.acknowledgedAt?.toISOString() };
  }
  return { acknowledged: false };
}

/** Wire shape of one alert for this viewer (`acknowledged` is theirs, not the owner's). */
export function toAlertListItem(alert: StoredAlert, viewerUserId: string): IAlertListItem {
  const ack = ackStateFor(alert, viewerUserId);
  return {
    id: alert.id ?? '',
    studentId: alert.studentId,
    userId: alert.userId,
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    acknowledged: ack.acknowledged,
    ...(ack.acknowledgedAt !== undefined ? { acknowledgedAt: ack.acknowledgedAt } : {}),
    createdAt: alert.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

/** Whether the viewer's own `alertTypes` for this student admit this alert (unset/empty = all). */
export function viewerWantsAlert(
  student: Student | undefined,
  viewerUserId: string,
  alertType: string
): boolean {
  const types = student?.alertPrefsFor(viewerUserId)?.alertTypes;
  if (!types || types.length === 0) return true;
  return types.includes(alertType);
}

export interface IAlertInboxRepos {
  readonly studentRepository: Pick<StudentRepository, 'findByUserId' | 'findById'>;
  readonly alertRepository: Pick<
    AlertRepository,
    'findVisibleTo' | 'findByStudentScope' | 'findById'
  >;
}

/** Every alert the viewer may see, trimmed to their own alert types, newest first. */
export async function listVisibleAlerts(
  viewerUserId: string,
  repos: IAlertInboxRepos
): Promise<IAlertListItem[]> {
  const students = await repos.studentRepository.findByUserId(viewerUserId);
  const access = new AlertAccess(students, viewerUserId);
  const alerts = await repos.alertRepository.findVisibleTo(viewerUserId, access.scopes);
  return alerts
    .filter((alert) => viewerWantsAlert(access.studentFor(alert), viewerUserId, alert.type))
    .map((alert) => toAlertListItem(alert, viewerUserId));
}

/** One student's alerts for a viewer who already passed `hasAccess`. */
export async function listStudentAlerts(
  student: Student,
  viewerUserId: string,
  repos: Pick<IAlertInboxRepos, 'alertRepository'>
): Promise<IAlertListItem[]> {
  const alerts = await repos.alertRepository.findByStudentScope(AlertAccess.scopeFor(student));
  return alerts
    .filter((alert) => viewerWantsAlert(student, viewerUserId, alert.type))
    .map((alert) => toAlertListItem(alert, viewerUserId));
}

/** The student an alert row belongs to, when its `studentId` is a Mongo id; else undefined. */
async function studentOfAlert(
  alert: IAlertData,
  repos: Pick<IAlertInboxRepos, 'studentRepository'>
): Promise<Student | null> {
  if (!ObjectId.isValid(alert.studentId)) return null;
  const student = await repos.studentRepository.findById(alert.studentId);
  return student && student.dataUserId() === alert.userId ? student : null;
}

/**
 * Load one alert the viewer may see, applying the same predicate as the list: 404 when it
 * does not exist or the viewer's alertTypes hide it, 403 when it belongs to a student the
 * viewer cannot access (a revoked adult loses it at once). Loads only that alert's student.
 */
export async function findAccessibleAlert(
  alertId: string,
  viewerUserId: string,
  repos: IAlertInboxRepos
): Promise<StoredAlert> {
  const alert = await repos.alertRepository.findById(alertId);
  if (!alert) {
    throw new NotFoundError('Alert not found');
  }
  const student = await studentOfAlert(alert, repos);
  const isOwnRow = alert.userId === viewerUserId;
  if (!isOwnRow && !(student?.hasAccess(viewerUserId) ?? false)) {
    throw new ForbiddenError('Forbidden');
  }
  if (!viewerWantsAlert(student ?? undefined, viewerUserId, alert.type)) {
    throw new NotFoundError('Alert not found');
  }
  return alert;
}
