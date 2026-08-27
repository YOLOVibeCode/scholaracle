import type { UserRole } from '@scholaracle/contracts';

export type AppNavView =
  | 'students'
  | 'connect-source'
  | 'dashboard'
  | 'course-detail'
  | 'assignment-detail'
  | 'sync'
  | 'run-history'
  | 'settings'
  | 'today'
  | 'work-pack';

const STUDENT_VIEWS: ReadonlySet<AppNavView> = new Set(['today', 'work-pack', 'settings']);
const PARENT_VIEWS: ReadonlySet<AppNavView> = new Set([
  'students',
  'connect-source',
  'dashboard',
  'course-detail',
  'assignment-detail',
  'sync',
  'run-history',
  'settings',
]);

export function isStudentSession(role?: UserRole | null): boolean {
  return role === 'student';
}

export function canSeeSync(role?: UserRole | null): boolean {
  return !isStudentSession(role);
}

export function canSeeConnectSource(role?: UserRole | null): boolean {
  return !isStudentSession(role);
}

export function canSeeHouseholdSettings(role?: UserRole | null): boolean {
  return !isStudentSession(role);
}

/** Portal cookies / companion SecureStore seed — parent device only. */
export function mayStorePortalCredentials(role?: UserRole | null): boolean {
  return !isStudentSession(role);
}

export function homeViewForRole(role?: UserRole | null): 'today' | 'students' {
  return isStudentSession(role) ? 'today' : 'students';
}

export function viewAfterNotificationTap(role?: UserRole | null): 'today' | 'students' {
  return homeViewForRole(role);
}

export function canNavigateTo(role: UserRole | null | undefined, view: AppNavView): boolean {
  return isStudentSession(role) ? STUDENT_VIEWS.has(view) : PARENT_VIEWS.has(view);
}

export function clampNavView(role: UserRole | null | undefined, view: AppNavView): AppNavView {
  if (canNavigateTo(role, view)) return view;
  return homeViewForRole(role);
}

export function chromeTestIdsForRole(role?: UserRole | null): readonly string[] {
  if (isStudentSession(role)) {
    return ['studio-today', 'studio-encouragement'];
  }
  return ['button-sync', 'button-connect-source', 'students-list'];
}

export function pushRegistrationForRole(
  role: UserRole | null | undefined,
  studentId?: string
): { readonly audience: 'parent' | 'student'; readonly studentId?: string } {
  if (isStudentSession(role)) {
    return studentId !== undefined && studentId !== ''
      ? { audience: 'student', studentId }
      : { audience: 'student' };
  }
  return { audience: 'parent' };
}
