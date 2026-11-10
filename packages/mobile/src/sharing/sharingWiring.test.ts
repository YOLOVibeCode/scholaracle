/**
 * Source-level wiring checks for sharing (repo pattern: studio/appRouting.test.ts,
 * store/storeComplianceWiring.test.ts). The repo has no RN render harness, so these guard the
 * navigation hooks, test ids the Maestro flows tap, and the role-aware hiding of controls.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { canNavigateTo, clampNavView } from '../studio/studentMode';

const MOBILE = path.join(__dirname, '..', '..');
const read = (...p: string[]): string => fs.readFileSync(path.join(MOBILE, ...p), 'utf8');

const APP = read('App.tsx');
const STUDENTS = read('src', 'screens', 'StudentsScreen.tsx');
const DASH = read('src', 'screens', 'DashboardScreen.tsx');
const EDIT = read('src', 'screens', 'StudentEditScreen.tsx');
const SETTINGS = read('src', 'screens', 'SettingsScreen.tsx');
const NOTIF = read('src', 'screens', 'NotificationSettingsScreen.tsx');
const INVITES = read('src', 'screens', 'InvitationsScreen.tsx');
const SHARE = read('src', 'screens', 'ShareStudentScreen.tsx');
const FAMILY = read('src', 'screens', 'FamilyScreen.tsx');
const ONBOARDING = read('src', 'onboarding', 'OnboardingScreen.tsx');
const SHARED_ALERTS = read('src', 'components', 'SharedStudentAlertsSection.tsx');
const EDITOR = read('src', 'components', 'MyAlertsEditor.tsx');
const E2E_SH = read('scripts', 'e2e.sh');
const E2E_ENV = read('e2e', 'e2e.env.example');
const SHARE_FLOW = read('e2e', 'maestro', 'share.yaml');
const ACCEPT_FLOW = read('e2e', 'maestro', 'accept.yaml');

describe('navigation', () => {
  it('App renders the three new views and routes back', () => {
    expect(APP).toMatch(/nav\.view === 'invitations'/);
    expect(APP).toMatch(/nav\.view === 'share'/);
    expect(APP).toMatch(/nav\.view === 'family' && nav\.student/);
    expect(APP).toMatch(/<InvitationsScreen/);
    expect(APP).toMatch(/<ShareStudentScreen/);
    expect(APP).toMatch(/<FamilyScreen/);
    expect(APP).toMatch(/onOpenInvitations=\{\(\) => setNav\(\{ view: 'invitations' \}\)\}/);
    expect(APP).toMatch(
      /onShare=\{\(\) => setNav\(\{ view: 'share', shareReturn: 'students' \}\)\}/
    );
    expect(APP).toMatch(
      /onOpenFamily=\{\(\) => setNav\(\{ view: 'family', student: nav\.student \}\)\}/
    );
    expect(APP).toMatch(/view: 'share', student: nav\.student, shareReturn: 'family'/);
  });

  it('parents may open the new views; student sessions are clamped home', () => {
    for (const view of ['invitations', 'share', 'family'] as const) {
      expect(canNavigateTo('parent', view)).toBe(true);
      expect(canNavigateTo('student', view)).toBe(false);
      expect(clampNavView('student', view)).toBe('today');
    }
  });
});

describe('home data lives in App (one fetch per session)', () => {
  it('App owns the home state, loads it once, and hands it to the screens', () => {
    expect(APP).toMatch(/useState<IHomeData>\(INITIAL_HOME\)/);
    expect(APP).toMatch(/loadHomeData\(apiClient\)/);
    expect(APP).toMatch(/setHome\(homeLoaded\(loaded\)\)/);
    expect(APP).toMatch(/home=\{home\}/);
    expect(APP).toMatch(/isRefreshing=\{isHomeRefreshing\}/);
    expect(APP).toMatch(/onRefresh=\{refreshHome\}/);
    expect(APP).toMatch(/accessById=\{accessMapOf\(home\)\}/);
    expect(APP).toMatch(/students=\{home\.students\}/);
    expect(APP).toMatch(/onChanged=\{refreshHome\}/);
  });

  it('a failed load keeps the previous data: never a reset to zero', () => {
    expect(APP).toMatch(/homeLoadFailed\(h, /);
    expect(APP).not.toMatch(/setStudentCount/);
    expect(APP).not.toMatch(/setPendingInviteCount/);
  });

  it('Students, Settings and Share read the lifted data instead of refetching', () => {
    expect(STUDENTS).toMatch(/readonly home: IHomeData/);
    expect(STUDENTS).not.toMatch(/apiClient\.getStudents\(/);
    expect(STUDENTS).not.toMatch(/apiClient\.getPendingSharingInvites\(/);
    expect(STUDENTS).not.toMatch(/apiClient\.getMySharing\(/);
    expect(STUDENTS).toMatch(/onPress=\{onRefresh\}/);
    expect(SETTINGS).toMatch(/readonly accessById\?: ReadonlyMap<string, StudentAccess>/);
    expect(SETTINGS).not.toMatch(/apiClient\.getStudents\(/);
    expect(SHARE).toMatch(/readonly students: readonly IStudentListItem\[\]/);
    expect(SHARE).toMatch(/students\.filter\(\(row\) => canInvite\(row\.access\)\)/);
    expect(SHARE).not.toMatch(/apiClient\.getStudents\(/);
  });

  it('a new co-parent with only a pending invitation lands on Students; Back from onboarding returns there', () => {
    expect(APP).toMatch(/showOnboardingGate\(home, setupRequested\)/);
    expect(APP).toMatch(/setSetupRequested\(true\)/);
    expect(APP).toMatch(
      /canReturnToInvitations\(home, setupRequested\)\s*\?\s*\(\): void => setSetupRequested\(false\)\s*:\s*undefined/
    );
    expect(ONBOARDING).toMatch(/onBack\?\(\): void/);
    expect(ONBOARDING).toMatch(/onBack && state\.step === firstStep/);
    expect(ONBOARDING).toContain('testID="button-onboarding-back"');
  });
});

describe('Students screen', () => {
  it('shows the invitations banner, the shared line, Share… and the set-password banner', () => {
    expect(STUDENTS).toContain('testID="banner-invitations"');
    expect(STUDENTS).toContain('testID="button-view-invitations"');
    expect(STUDENTS).toContain('testID="text-student-shared"');
    expect(STUDENTS).toContain('testID="button-share-students"');
    expect(STUDENTS).toContain('testID="banner-set-password"');
    expect(STUDENTS).toContain('testID="button-set-password-dismiss"');
    expect(STUDENTS).toMatch(/Linking\.openURL\(forgotPasswordUrl\(setPassword\.email\)\)/);
  });

  it('re-reads the session user on launch and on foreground, hiding the banner once the flag is gone', () => {
    expect(STUDENTS).toMatch(/apiClient\.getSessionUser\(\)/);
    expect(STUDENTS).toMatch(/AppState\.addEventListener\('change'/);
    expect(STUDENTS).toMatch(/if \(state === 'active'\) void checkSetPassword\(\);/);
    expect(STUDENTS).toMatch(
      /shouldShowSetPasswordBanner\(user, dismissed\) \? \{ userId: user\.id, email: user\.email \} : null/
    );
  });

  it('long-press edit is offered only to owners and admins', () => {
    expect(STUDENTS).toMatch(/canEditStudent\(item\.access\)/);
    expect(STUDENTS).toMatch(/onLongPress=\{editable \?/);
  });
});

describe('role-aware hiding (sharing-spec §4.2)', () => {
  it('Dashboard Edit is withheld for members and a Family button is added', () => {
    expect(APP).toMatch(/canEditStudent\(nav\.student\.access\)/);
    expect(DASH).toContain('testID="button-family"');
    expect(DASH).toMatch(/onOpenFamily\?\(\): void/);
  });

  it('Remove student is owner-only on the edit screen', () => {
    expect(EDIT).toMatch(/canRemoveStudent\(student\.access\)/);
    expect(EDIT).toMatch(/\{allowRemove \? \(/);
    expect(EDIT).toContain('testID="text-remove-owner-only"');
  });

  it('server-side disconnect is hidden for members in Settings', () => {
    expect(SETTINGS).toMatch(
      /canDisconnectOnServerAs\(accessById\?\.get\(source\.studentId \?\? ''\)\)/
    );
    expect(SETTINGS).toMatch(/disconnectConfirmText\(source, serverOption\)/);
    // The phone-only option stays for everyone.
    expect(SETTINGS).toMatch(/runDisconnect\(source, 'local-only'\)/);
  });

  it('members get a message instead of a Connect button when no portal is on the phone', () => {
    expect(APP).toMatch(/if \(!canManagePortals\(student\.access\)\)/);
    expect(APP).toMatch(/connectPortalBlockedMessage\(student\.name\)/);
  });
});

describe('screens use the client and expose stable test ids', () => {
  it('Invitations', () => {
    expect(INVITES).toMatch(/apiClient\.getPendingSharingInvites\(\)/);
    expect(INVITES).toMatch(/apiClient\.acceptSharingInvites\(selection\)/);
    expect(INVITES).toMatch(/apiClient\.declineSharingInvites\(selection\)/);
    for (const id of [
      'invitations-screen',
      'button-invitations-back',
      'button-accept-invitation',
      'button-decline-invitation',
      'invitations-empty',
      'invitations-error',
    ]) {
      expect(INVITES).toContain(`testID="${id}"`);
    }
  });

  it('Share: required channels, preselection, result and the opt-in share sheet', () => {
    expect(SHARE).toMatch(/apiClient\.sendSharingInvite\(built\.request\)/);
    expect(SHARE).toMatch(/initialShareForm\(preselectStudentId\)/);
    expect(SHARE).toMatch(/Share\.share\(\{/);
    expect(SHARE).toMatch(/smsOptInShareMessage\(/);
    expect(SHARE).toMatch(/ALERT_CHANNELS\.map/);
    for (const id of [
      'share-screen',
      'input-share-email',
      'input-share-name',
      'input-share-phone',
      'switch-share-admin',
      'check-share-student',
      'text-share-selected',
      'button-share-send',
      'share-error',
      'share-result',
      'button-share-optin-link',
      'button-share-done',
    ]) {
      expect(SHARE).toContain(`testID="${id}"`);
    }
    expect(SHARE).toMatch(/testID=\{`chip-share-label-\$\{option\.value\}`\}/);
    expect(SHARE).toMatch(/testID=\{`switch-share-channel-\$\{channel\.value\}`\}/);
  });

  it('Family & guardians: role-aware rows, My alerts, Leave, Share', () => {
    expect(FAMILY).toMatch(/apiClient\.getStudentContacts\(student\.id\)/);
    expect(FAMILY).toMatch(/familyRows\(people, viewer\)/);
    expect(FAMILY).toMatch(/apiClient\.leaveStudent\(student\.id\)/);
    expect(FAMILY).toMatch(/apiClient\.removeStudentContact\(student\.id, email\)/);
    expect(FAMILY).toMatch(/apiClient\.setStudentContactAdmin\(student\.id, email, makeAdmin\)/);
    expect(FAMILY).toMatch(/apiClient\.resendSharingInvite\(person\.inviteGroupId\)/);
    expect(FAMILY).toMatch(
      /apiClient\.updateStudentContact\(student\.id, row\.person\.email, body\)/
    );
    expect(FAMILY).toMatch(/apiClient\.updateOwnerAlertPrefs\(student\.id, body\)/);
    expect(FAMILY).toMatch(/canInvite\(student\.access\)/);
    // Leave and Remove are confirmed with a destructive alert first.
    expect(FAMILY.indexOf("case 'leave':")).toBeLessThan(FAMILY.indexOf('apiClient.leaveStudent('));
    expect(FAMILY).toMatch(/style: 'destructive'/);
    for (const id of [
      'family-screen',
      'button-family-back',
      'button-family-share',
      'family-row',
      'chip-role',
      'chip-status',
      'chip-texts',
      'family-error',
      'family-action-error',
    ]) {
      expect(FAMILY).toContain(`testID="${id}"`);
    }
    expect(FAMILY).toMatch(/testID=\{`button-family-\$\{action\}`\}/);
  });

  it('Family: Leave navigates away without reloading, and no state is set after unmount', () => {
    expect(FAMILY).toMatch(/const mounted = useRef\(true\)/);
    expect(FAMILY).toMatch(/mounted\.current = false/);
    expect(FAMILY).toMatch(/if \(!mounted\.current\) return;/);
    expect(FAMILY).toMatch(/if \(reload\) await load\(\);/);
    // The leave action passes reload = false and calls onLeft right after the server call.
    expect(FAMILY).toMatch(
      /await apiClient\.leaveStudent\(student\.id\);\s*onLeft\(\);\s*\},\s*false\s*\)/
    );
  });

  it('Family: an SMS opt-in link from saving My alerts goes out through the share sheet', () => {
    expect(FAMILY).toMatch(/myAlertsFollowUp\(result, row\.person, student\.name\)/);
    expect(FAMILY).toMatch(/Share\.share\(\{ message: followUp \}\)/);
    expect(FAMILY).toMatch(/name: user\.name/);
  });

  it('Notification settings gains a per-shared-student section with Silence', () => {
    expect(NOTIF).toMatch(/<SharedStudentAlertsSection \/>/);
    expect(SHARED_ALERTS).toMatch(/apiClient\.getMySharing\(\)/);
    expect(SHARED_ALERTS).toMatch(/\.filter\(\(s\) => s\.access !== 'owner'\)/);
    expect(SHARED_ALERTS).toMatch(/apiClient\.updateStudentContact\(/);
    expect(SHARED_ALERTS).toContain('testID="shared-student-alerts"');
    expect(EDITOR).toMatch(/silenced \? unsilence\(draft\) : silence\(draft\)/);
    expect(EDITOR).toMatch(/testID=\{`\$\{testID\}-silence`\}/);
    expect(EDITOR).toMatch(/testID=\{`\$\{testID\}-channel-\$\{channel\.value\}`\}/);
  });

  it('My alerts editor compares against what was last saved, so a save clears "unsaved"', () => {
    expect(EDITOR).toMatch(/const \[lastSaved, setLastSaved\] = useState<IMyAlertsDraft>\(saved\)/);
    expect(EDITOR).toMatch(/setLastSaved\(next\)/);
    expect(EDITOR).toMatch(/myAlertsDirty\(draft, lastSaved\)/);
    expect(EDITOR).not.toMatch(/myAlertsDirty\(draft, saved\)/);
    expect(EDITOR).toMatch(/ALERT_CHANNELS\.map/);
  });
});

describe('Maestro share suite', () => {
  it('e2e.sh has a share suite gated on the co-parent variables, documented in the env example', () => {
    expect(E2E_SH).toMatch(
      /share\) flows=\(e2e\/maestro\/share\.yaml e2e\/maestro\/accept\.yaml\)/
    );
    expect(E2E_SH).toMatch(/MAESTRO_COPARENT_EMAIL/);
    expect(E2E_SH).toMatch(/MAESTRO_COPARENT_PASSWORD/);
    expect(E2E_ENV).toMatch(/^MAESTRO_COPARENT_EMAIL=op:\/\//m);
    expect(E2E_ENV).toMatch(/^MAESTRO_COPARENT_PASSWORD=op:\/\//m);
    // Names only: never a value.
    expect(E2E_ENV).not.toMatch(/@[a-z0-9-]+\.(com|net|org)/i);
  });

  it('share.yaml drives the owner through Family & guardians → Share with the ids above', () => {
    for (const id of [
      'button-family',
      'family-screen',
      'button-family-share',
      'share-screen',
      'input-share-email',
      'text-share-selected',
      'button-share-send',
      'share-result',
      'button-share-done',
    ]) {
      expect(SHARE_FLOW).toContain(`id: ${id}`);
    }
    expect(SHARE_FLOW).toMatch(/\$\{MAESTRO_COPARENT_EMAIL\}/);
  });

  it('accept.yaml signs in as the co-parent and accepts from the banner', () => {
    expect(ACCEPT_FLOW).toMatch(/MAESTRO_PARENT_EMAIL: \$\{MAESTRO_COPARENT_EMAIL\}/);
    expect(ACCEPT_FLOW).toMatch(/MAESTRO_PARENT_PASSWORD: \$\{MAESTRO_COPARENT_PASSWORD\}/);
    for (const id of [
      'banner-invitations',
      'invitations-screen',
      'button-accept-invitation',
      'button-invitations-back',
      'text-student-shared',
    ]) {
      expect(ACCEPT_FLOW).toContain(`id: ${id}`);
    }
  });
});
