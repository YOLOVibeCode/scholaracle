/**
 * The parent home data App owns and hands down: the student list, pending sharing invitations
 * and (when a shared student lacks an inviter name) GET /api/sharing/mine. Loaded once per
 * session, refreshed on request; a failed refresh keeps the previous data so a transient error
 * can never flip a parent into onboarding. Pure except `loadHomeData`, which takes the client.
 */

import type {
  IMySharingStudent,
  IMySharingView,
  ISharingPendingInvite,
  IStudentListItem,
  StudentAccess,
} from '@scholaracle/contracts';
import { accessMapFromStudents } from './accessMatrix';
import { needsInviterNames } from './studentsHome';

/** `loading` only before the first result; afterwards `ready` or `error` (data retained). */
export type HomeStatus = 'loading' | 'ready' | 'error';

export interface IHomeData {
  readonly status: HomeStatus;
  readonly students: readonly IStudentListItem[];
  readonly pendingInvites: readonly ISharingPendingInvite[];
  /** Inviter names for shared students; null when not needed or unavailable. */
  readonly mine: readonly IMySharingStudent[] | null;
  /** Message of the last failed load; cleared by the next success. */
  readonly error: string | null;
}

export const INITIAL_HOME: IHomeData = {
  status: 'loading',
  students: [],
  pendingInvites: [],
  mine: null,
  error: null,
};

/** Student sessions have no household list: ready with nothing. */
export function emptyHomeReady(): IHomeData {
  return { ...INITIAL_HOME, status: 'ready' };
}

export interface IHomeApi {
  getStudents(): Promise<readonly IStudentListItem[]>;
  getPendingSharingInvites(): Promise<readonly ISharingPendingInvite[]>;
  getMySharing(): Promise<IMySharingView>;
}

export type IHomeLoaded = Pick<IHomeData, 'students' | 'pendingInvites' | 'mine'>;

/**
 * Students and pending invitations in parallel (a failing invitations call counts as none);
 * inviter names only when a shared student needs one. Throws only when the students call fails.
 */
export async function loadHomeData(api: IHomeApi): Promise<IHomeLoaded> {
  const [students, pendingInvites] = await Promise.all([
    api.getStudents(),
    api.getPendingSharingInvites().catch((): readonly ISharingPendingInvite[] => []),
  ]);
  const mine = needsInviterNames(students)
    ? await api
        .getMySharing()
        .then((view) => view.students)
        .catch((): null => null)
    : null;
  return { students, pendingInvites, mine };
}

export function homeLoaded(loaded: IHomeLoaded): IHomeData {
  return { status: 'ready', ...loaded, error: null };
}

/** Keeps whatever was loaded before; only the very first failure leaves the data empty. */
export function homeLoadFailed(prev: IHomeData, message: string): IHomeData {
  return { ...prev, status: prev.status === 'loading' ? 'error' : prev.status, error: message };
}

/** After onboarding created students: show them at once, before the refresh lands. */
export function homeWithStudents(
  prev: IHomeData,
  students: readonly IStudentListItem[]
): IHomeData {
  return { ...prev, status: 'ready', students, error: null };
}

/** null while the first load is in flight (App shows its splash). */
export function studentCountOf(home: IHomeData): number | null {
  return home.status === 'loading' ? null : home.students.length;
}

export function accessMapOf(home: IHomeData): ReadonlyMap<string, StudentAccess> {
  return accessMapFromStudents(home.students);
}

/**
 * Onboarding shows only for a successful load with no students and no invitation waiting
 * (or when "Get started" was tapped). Never on an error: the Students screen shows Retry.
 */
export function showOnboardingGate(home: IHomeData, setupRequested: boolean): boolean {
  if (home.status !== 'ready' || home.students.length !== 0) return false;
  return home.pendingInvites.length === 0 || setupRequested;
}

/** "Back" from onboarding makes sense only when an invitation is waiting behind it. */
export function canReturnToInvitations(home: IHomeData, setupRequested: boolean): boolean {
  return setupRequested && home.pendingInvites.length > 0;
}
