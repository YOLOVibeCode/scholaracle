import * as fs from 'node:fs';
import * as path from 'node:path';

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'App.tsx'), 'utf8');
const LOGIN = fs.readFileSync(path.join(__dirname, '..', 'screens', 'LoginScreen.tsx'), 'utf8');
const TODAY_SCREEN = fs.readFileSync(
  path.join(__dirname, '..', 'screens', 'TodayScreen.tsx'),
  'utf8'
);
const WEEK_VIEW = fs.readFileSync(path.join(__dirname, 'WeekView.tsx'), 'utf8');
const STATUS_SHEET = fs.readFileSync(path.join(__dirname, 'StatusSheet.tsx'), 'utf8');
const TODAY_VIEW = fs.readFileSync(path.join(__dirname, 'TodayView.tsx'), 'utf8');
const STUDIO_TABS = fs.readFileSync(path.join(__dirname, 'studioTabs.ts'), 'utf8');

describe('mobile logged-out + student home', () => {
  it('logged-out users land on LoginScreen; parent onboarding is opt-in', () => {
    expect(APP).toMatch(/import \{ LoginScreen \}/);
    expect(APP).toMatch(/useState<'login' \| 'onboarding'>\('login'\)/);
    expect(APP).toMatch(/<LoginScreen/);
    expect(APP).toMatch(/onCreateAccount/);
  });

  it('student sessions render TodayScreen and skip the household student list fetch', () => {
    expect(APP).toMatch(/if \(studentMode\) \{/);
    expect(APP).toMatch(/<TodayScreen/);
    expect(APP).toMatch(/<StudentWorkPackScreen/);
    expect(APP).toMatch(/setStudentCount\(0\)/);
  });

  it('student mode has Today and This week tabs, controlled by App nav so a push can pick one', () => {
    expect(APP).toMatch(/tab=\{studioTab\}/);
    expect(APP).toMatch(/onSelectTab=\{\(tab\) => setNav\(\{ view: tab \}\)\}/);
    expect(APP).toMatch(/studioReturn: studioTab/);
    expect(APP).toMatch(/setNav\(\{ view: nav\.studioReturn \?\? 'today' \}\)/);
    expect(STUDIO_TABS).toMatch(/\{ tab: 'today', label: 'Today' \}/);
    expect(STUDIO_TABS).toMatch(/\{ tab: 'week', label: 'This week' \}/);
    expect(TODAY_SCREEN).toMatch(/STUDIO_TABS\.map/);
    expect(TODAY_SCREEN).toMatch(/accessibilityRole="tab"/);
    expect(TODAY_SCREEN).toMatch(/studio\.getStudioWeek\(\)/);
    expect(TODAY_SCREEN).toMatch(/<RefreshControl/);
    expect(TODAY_SCREEN).toMatch(/<WeekView/);
    // Fetch on first show only; a status change marks the other tab stale.
    expect(TODAY_SCREEN).toMatch(/if \(!needsLoad\(stale, tab\)\) return;/);
    expect(TODAY_SCREEN).toMatch(/setStale\(\(s\) => markFresh\(s, tab\)\)/);
    expect(TODAY_SCREEN).toMatch(/setStale\(\(s\) => markOtherStale\(s, tab\)\)/);
    expect(TODAY_SCREEN).not.toMatch(/void loadWeek\(\);\s*void loadToday\(\);/);
  });

  it('Today and This week share one status sheet; the row moves first and snaps back on failure', () => {
    expect(TODAY_SCREEN).toMatch(/<StatusSheet/);
    expect(TODAY_SCREEN.match(/onChangeStatus=\{setSheetTarget\}/g)).toHaveLength(2);
    // Snapshot + optimistic move + restore on failure come from the shared helper.
    expect(TODAY_SCREEN).toMatch(/submitWithRollback<IWeekView, IStudentStatusUpdateResponse>\(/);
    expect(TODAY_SCREEN).toMatch(/current: week\.view,/);
    expect(TODAY_SCREEN).toMatch(
      /optimistic: \(view\) => applyStudentStatusLocally\(view, assignmentExternalId, status\)/
    );
    expect(TODAY_SCREEN).toMatch(
      /submit: \(\) => studio\.patchStudioAssignmentStatus\(assignmentExternalId, status, note\)/
    );
    // After the rollback, a best-effort refetch of the active tab; on success the same refetch.
    expect(TODAY_SCREEN).toMatch(/catch \(err: unknown\) \{[\s\S]*?void load\(tab\);\s*throw err;/);
    expect(TODAY_SCREEN).toMatch(/return response;/);
    expect(TODAY_VIEW).toMatch(/onChangeStatus\?\(target: IStatusSheetTarget\)/);
    expect(WEEK_VIEW).toMatch(/currentStatus: row\.studentStatus/);
  });

  it('the sheet offers the four statuses, a 140-unit note, and says only what the server did', () => {
    expect(STATUS_SHEET).toMatch(/STATUS_OPTIONS\.map/);
    expect(STATUS_SHEET).toMatch(/maxLength=\{STUDENT_HELP_NOTE_MAX_CHARS\}/);
    expect(STATUS_SHEET).toMatch(/noteCounter\(note\)/);
    // The outcome line comes from the PATCH response, never a hard-coded "were told".
    expect(STATUS_SHEET).toMatch(/needHelpOutcomeMessage\(response\)/);
    expect(STATUS_SHEET).not.toMatch(/NEED_HELP_SENT_MESSAGE/);
    expect(STATUS_SHEET).not.toMatch(/Your grown-ups were told/);
    // Dismiss is ignored while a save is in flight.
    expect(STATUS_SHEET).toMatch(/if \(!canDismiss\(busy\)\) return;/);
    expect(STATUS_SHEET).toMatch(/onRequestClose=\{requestClose\}/);
    expect(STATUS_SHEET).toMatch(/testID="need-help-send"/);
    expect(STATUS_SHEET).not.toMatch(/Alert\.alert/);
  });

  it('every touchable on the week screens carries an accessibility role or label', () => {
    for (const src of [WEEK_VIEW, STATUS_SHEET, TODAY_VIEW]) {
      const touchables = src.match(/<(TouchableOpacity|Pressable)\b[\s\S]*?[^=]>/g) ?? [];
      expect(touchables.length).toBeGreaterThan(0);
      for (const tag of touchables) {
        expect(tag).toMatch(/accessibilityRole=|accessibilityLabel=/);
      }
    }
  });

  it('login offers a forgot-password link that opens the web reset page', () => {
    expect(LOGIN).toMatch(/link-forgot-password/);
    expect(LOGIN).toMatch(/Forgot password\?/);
    expect(LOGIN).toMatch(/Linking\.openURL\(forgotPasswordUrl\(email\)\)/);
  });

  it('login offers parent-only signup — students cannot self-register', () => {
    expect(LOGIN).toMatch(/onCreateAccount/);
    expect(LOGIN).toMatch(/Create a parent account/);
    expect(LOGIN).not.toMatch(/Create a student account/);
  });
});
