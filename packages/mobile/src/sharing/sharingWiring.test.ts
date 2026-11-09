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

  it('a new co-parent with only a pending invitation lands on Students, not onboarding', () => {
    expect(APP).toMatch(
      /showOnboardingGate\(\{ studentCount, pendingInviteCount, setupRequested \}\)/
    );
    expect(APP).toMatch(/loadHomeCounts\(apiClient\)/);
    expect(APP).toMatch(/setSetupRequested\(true\)/);
    expect(APP).toMatch(/onChanged=\{refreshHomeCounts\}/);
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
    expect(STUDENTS).toMatch(/apiClient\.getPendingSharingInvites\(\)\.catch\(\(\) => \[\]\)/);
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
      /canDisconnectOnServerAs\(accessById\.get\(source\.studentId \?\? ''\)\)/
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
    expect(SHARE).toMatch(/rows\.filter\(\(row\) => canInvite\(row\.access\)\)/);
    expect(SHARE).toMatch(/Share\.share\(\{/);
    expect(SHARE).toMatch(/smsOptInShareMessage\(/);
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
