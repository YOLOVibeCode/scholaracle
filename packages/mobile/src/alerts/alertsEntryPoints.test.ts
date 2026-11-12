/**
 * Source-level wiring checks (the repo has no RN render harness: RN 0.86 ESM
 * breaks jest-expo). Mirrors src/studio/appRouting.test.ts.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { canNavigateTo } from '../studio/studentMode';

const MOBILE = path.join(__dirname, '..', '..');
const read = (...p: string[]): string => fs.readFileSync(path.join(MOBILE, ...p), 'utf8');

const APP = read('App.tsx');
const STUDENTS = read('src', 'screens', 'StudentsScreen.tsx');
const SETTINGS = read('src', 'screens', 'SettingsScreen.tsx');
const ALERTS = read('src', 'screens', 'AlertsScreen.tsx');
const NOTIF = read('src', 'screens', 'NotificationSettingsScreen.tsx');

describe('nav wiring', () => {
  it('App renders both new views and routes back correctly', () => {
    expect(APP).toMatch(/nav\.view === 'alerts'/);
    expect(APP).toMatch(/<AlertsScreen onBack=\{\(\) => setNav\(\{ view: 'students' \}\)\}/);
    expect(APP).toMatch(/nav\.view === 'notification-settings'/);
    expect(APP).toMatch(
      /<NotificationSettingsScreen onBack=\{\(\) => setNav\(\{ view: 'settings' \}\)\}/
    );
    expect(APP).toMatch(/onOpenAlerts=\{\(\) => setNav\(\{ view: 'alerts' \}\)\}/);
    expect(APP).toMatch(
      /onOpenNotificationSettings=\{\(\) => setNav\(\{ view: 'notification-settings' \}\)\}/
    );
  });

  it('parents may open the new views; student sessions may not', () => {
    expect(canNavigateTo('parent', 'alerts')).toBe(true);
    expect(canNavigateTo('parent', 'notification-settings')).toBe(true);
    expect(canNavigateTo('student', 'alerts')).toBe(false);
    expect(canNavigateTo('student', 'notification-settings')).toBe(false);
  });

  it('StudentsScreen has an Alerts entry and SettingsScreen a notification row', () => {
    expect(STUDENTS).toMatch(/onOpenAlerts/);
    expect(STUDENTS).toMatch(/accessibilityLabel="Alerts"/);
    expect(SETTINGS).toMatch(/link-notification-settings/);
    expect(SETTINGS).toMatch(/onOpenNotificationSettings/);
  });
});

describe('screens', () => {
  it('AlertsScreen uses the client, accessibility props and filter/ack controls', () => {
    expect(ALERTS).toMatch(/apiClient\.getAlerts\(\)/);
    expect(ALERTS).toMatch(/apiClient\.acknowledgeAlert\(/);
    expect(ALERTS).toMatch(/RefreshControl/);
    expect(ALERTS).toMatch(/accessibilityRole="tab"/);
    expect(ALERTS).toMatch(/button-acknowledge/);
    expect(ALERTS).toMatch(/alerts-empty/);
    expect(ALERTS).toMatch(/alerts-error/);
  });

  it('NotificationSettingsScreen opens OS settings and saves through the client', () => {
    expect(NOTIF).toMatch(/Linking\.openSettings\(\)/);
    expect(NOTIF).toMatch(/apiClient\.getNotificationSettings\(\)/);
    expect(NOTIF).toMatch(/apiClient\.updateNotificationSettings\(buildUpdate\(draft\)\)/);
    expect(NOTIF).toMatch(/deviceTimezone\(\)/);
    expect(NOTIF).toMatch(/text-save-error/);
  });

  it('neither screen uses the banned URL API', () => {
    for (const src of [ALERTS, NOTIF]) {
      expect(src).not.toMatch(/new URL\(/);
      expect(src).not.toMatch(/URLSearchParams/);
    }
  });
});
