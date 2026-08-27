import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  canNavigateTo,
  canSeeConnectSource,
  canSeeHouseholdSettings,
  canSeeSync,
  chromeTestIdsForRole,
  clampNavView,
  homeViewForRole,
  isStudentSession,
  mayStorePortalCredentials,
  pushRegistrationForRole,
  viewAfterNotificationTap,
} from './studentMode';

describe('student-mode gate — who sees Sync', () => {
  it('parent sees Sync, Connect source, household settings, and the Students list', () => {
    expect(isStudentSession('parent')).toBe(false);
    expect(isStudentSession(undefined)).toBe(false);
    expect(canSeeSync('parent')).toBe(true);
    expect(canSeeConnectSource('parent')).toBe(true);
    expect(canSeeHouseholdSettings('parent')).toBe(true);
    expect(mayStorePortalCredentials('parent')).toBe(true);
    expect(homeViewForRole('parent')).toBe('students');
    expect(viewAfterNotificationTap('parent')).toBe('students');
    expect(chromeTestIdsForRole('parent')).toEqual(
      expect.arrayContaining(['button-sync', 'button-connect-source', 'students-list'])
    );
    expect(chromeTestIdsForRole('parent')).not.toContain('studio-today');
  });

  it('student lands on Today and never sees Sync, Sources, or household chrome', () => {
    expect(isStudentSession('student')).toBe(true);
    expect(canSeeSync('student')).toBe(false);
    expect(canSeeConnectSource('student')).toBe(false);
    expect(canSeeHouseholdSettings('student')).toBe(false);
    expect(mayStorePortalCredentials('student')).toBe(false);
    expect(homeViewForRole('student')).toBe('today');
    expect(viewAfterNotificationTap('student')).toBe('today');
    expect(chromeTestIdsForRole('student')).toEqual(
      expect.arrayContaining(['studio-today', 'studio-encouragement'])
    );
    expect(chromeTestIdsForRole('student')).not.toContain('button-sync');
    expect(chromeTestIdsForRole('student')).not.toContain('button-connect-source');
    expect(chromeTestIdsForRole('student')).not.toContain('students-list');
  });

  it('clamps parent-only views so a student cannot open Sync or Connect source', () => {
    expect(canNavigateTo('student', 'sync')).toBe(false);
    expect(canNavigateTo('student', 'connect-source')).toBe(false);
    expect(canNavigateTo('student', 'students')).toBe(false);
    expect(canNavigateTo('student', 'today')).toBe(true);
    expect(canNavigateTo('student', 'work-pack')).toBe(true);
    expect(canNavigateTo('parent', 'sync')).toBe(true);
    expect(canNavigateTo('parent', 'today')).toBe(false);
    expect(clampNavView('student', 'sync')).toBe('today');
    expect(clampNavView('student', 'connect-source')).toBe('today');
    expect(clampNavView('parent', 'sync')).toBe('sync');
    expect(clampNavView('parent', 'today')).toBe('students');
  });

  it('student push registration carries audience student + studentId; parent stays parent', () => {
    expect(pushRegistrationForRole('student', '507f1f77bcf86cd799439011')).toEqual({
      audience: 'student',
      studentId: '507f1f77bcf86cd799439011',
    });
    expect(pushRegistrationForRole('parent', 'ignored')).toEqual({ audience: 'parent' });
  });
});

describe('ISP — student studio screens stay off parent-only ports', () => {
  it('Today / work-pack / studentMode source do not import nudge, provision, or grades', () => {
    const dir = __dirname;
    const screens = path.join(dir, '..', 'screens');
    const files = [
      path.join(dir, 'studentMode.ts'),
      path.join(dir, 'openWorkPackPrimary.ts'),
      path.join(dir, 'TodayView.tsx'),
      path.join(dir, 'WorkPackView.tsx'),
      path.join(screens, 'TodayScreen.tsx'),
      path.join(screens, 'StudentWorkPackScreen.tsx'),
    ];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).not.toMatch(/INudgePublisher/);
      expect(src).not.toMatch(/IStudentProvisioner/);
      expect(src).not.toMatch(/IStudentMagicLink/);
      expect(src).not.toMatch(/IStudentGradesResponse/);
      expect(src).not.toMatch(/IStudentReadApi/);
      expect(src).not.toMatch(/getStudents\(/);
      expect(src).not.toMatch(/getStudentGrades/);
      expect(src).not.toMatch(/expo-secure-store/);
      expect(src).not.toMatch(/devCredentialSeed/);
      expect(src).not.toMatch(/COMPANION_PORTAL/);
    }
  });
});
