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
    expect(TODAY_SCREEN).toMatch(/\{ tab: 'today', label: 'Today' \}/);
    expect(TODAY_SCREEN).toMatch(/\{ tab: 'week', label: 'This week' \}/);
    expect(TODAY_SCREEN).toMatch(/accessibilityRole="tab"/);
    expect(TODAY_SCREEN).toMatch(/studio\.getStudioWeek\(\)/);
    expect(TODAY_SCREEN).toMatch(/<RefreshControl/);
    expect(TODAY_SCREEN).toMatch(/<WeekView/);
  });

  it('Today and This week share one status sheet; done moves locally then refetches', () => {
    expect(TODAY_SCREEN).toMatch(/<StatusSheet/);
    expect(TODAY_SCREEN.match(/onChangeStatus=\{setSheetTarget\}/g)).toHaveLength(2);
    expect(TODAY_SCREEN).toMatch(
      /applyStudentStatusLocally\(s\.view, assignmentExternalId, status\)/
    );
    expect(TODAY_SCREEN).toMatch(
      /studio\.patchStudioAssignmentStatus\(assignmentExternalId, status, note\)/
    );
    expect(TODAY_SCREEN).toMatch(/void loadWeek\(\);\s*void loadToday\(\);/);
    // A refused PATCH refetches so the optimistic row snaps back to server truth.
    expect(TODAY_SCREEN).toMatch(
      /catch \(err: unknown\) \{\s*\/\/[^\n]*\n\s*void loadWeek\(\);\s*throw err;/
    );
    expect(TODAY_VIEW).toMatch(/onChangeStatus\?\(target: IStatusSheetTarget\)/);
    expect(WEEK_VIEW).toMatch(/currentStatus: row\.studentStatus/);
  });

  it('the sheet offers the four statuses, a 140-char note for Need help, and the told copy', () => {
    expect(STATUS_SHEET).toMatch(/STATUS_OPTIONS\.map/);
    expect(STATUS_SHEET).toMatch(/maxLength=\{STUDENT_NOTE_MAX_CHARS\}/);
    expect(STATUS_SHEET).toMatch(/noteCounter\(note\)/);
    expect(STATUS_SHEET).toMatch(/\{NEED_HELP_SENT_MESSAGE\}/);
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
