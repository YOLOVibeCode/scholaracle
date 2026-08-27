import * as fs from 'node:fs';
import * as path from 'node:path';

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'App.tsx'), 'utf8');
const LOGIN = fs.readFileSync(path.join(__dirname, '..', 'screens', 'LoginScreen.tsx'), 'utf8');

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

  it('login offers parent-only signup — students cannot self-register', () => {
    expect(LOGIN).toMatch(/onCreateAccount/);
    expect(LOGIN).toMatch(/Create a parent account/);
    expect(LOGIN).not.toMatch(/Create a student account/);
  });
});
