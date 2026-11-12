/**
 * Source-level wiring checks (repo pattern: see studio/appRouting.test.ts).
 * Guards the store-compliance gate and the navigation hooks for the
 * Plan & usage, student edit/remove and server-disconnect features.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { canNavigateTo, clampNavView } from '../studio/studentMode';

const MOBILE = path.join(__dirname, '..', '..');
const read = (...p: string[]): string => fs.readFileSync(path.join(MOBILE, ...p), 'utf8');

const APP = read('App.tsx');
const SETTINGS = read('src', 'screens', 'SettingsScreen.tsx');
const PLAN = read('src', 'screens', 'PlanScreen.tsx');
const EDIT = read('src', 'screens', 'StudentEditScreen.tsx');
const DASH = read('src', 'screens', 'DashboardScreen.tsx');
const STUDENTS = read('src', 'screens', 'StudentsScreen.tsx');

describe('Plan & usage wiring', () => {
  it('Settings has a Plan & usage row for parents only, opening the plan view', () => {
    expect(SETTINGS).toMatch(/!hideHousehold && onOpenPlan/);
    expect(SETTINGS).toMatch(/testID="link-plan-usage"/);
    expect(SETTINGS).toMatch(/Plan & usage/);
    expect(APP).toMatch(/onOpenPlan=\{\(\) => setNav\(\{ view: 'plan' \}\)\}/);
    expect(APP).toMatch(/<PlanScreen onBack=\{\(\) => setNav\(\{ view: 'settings' \}\)\} \/>/);
  });

  it('plan view is parent-only', () => {
    expect(canNavigateTo('parent', 'plan')).toBe(true);
    expect(canNavigateTo('student', 'plan')).toBe(false);
    expect(clampNavView('student', 'plan')).toBe('today');
  });

  it('web links come only from planManageLinks gated by platform and US locale', () => {
    expect(PLAN).toContain('canLinkToWebPlans(Platform.OS, resolvedDeviceLocale())');
    expect(PLAN).toContain('planManageLinks(canLinkOut, STORE_LEGAL_URLS)');
    // The locale-only check must not come back: it showed the links on Android.
    expect(PLAN).not.toContain('isUsStorefrontLocale');
    // The screen itself never opens a URL outside the gated link list.
    expect(PLAN.match(/Linking\.openURL/g)).toHaveLength(1);
    expect(PLAN).toContain('Linking.openURL(link.url)');
    expect(PLAN).not.toMatch(/https?:\/\//);
  });

  it('is read-only: no checkout, purchase or price text', () => {
    expect(PLAN).not.toMatch(/purchase|subscribe|checkout|\$\d/i);
  });
});

describe('Edit / remove student wiring', () => {
  it('Dashboard and Students screens expose edit entry points', () => {
    expect(DASH).toMatch(/onEditStudent\?\(\): void/);
    expect(DASH).toMatch(/testID="button-edit-student"/);
    expect(STUDENTS).toMatch(/onLongPress=/);
    expect(APP).toMatch(/view: 'student-edit'/);
  });

  it('removal is confirmed with a destructive Alert before anything runs', () => {
    const confirmIdx = EDIT.indexOf('Alert.alert(`Remove ${student.name}?`');
    const removeIdx = EDIT.indexOf('removeStudent(');
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(removeIdx).toBeGreaterThan(confirmIdx);
    expect(EDIT).toMatch(/style: 'destructive'/);
  });

  it('student-edit view is parent-only', () => {
    expect(canNavigateTo('parent', 'student-edit')).toBe(true);
    expect(canNavigateTo('student', 'student-edit')).toBe(false);
  });
});

describe('Settings server-side disconnect wiring', () => {
  it('uses disconnectSource with both modes and reports failures', () => {
    expect(SETTINGS).toMatch(/runDisconnect\(source, 'local-only'\)/);
    expect(SETTINGS).toMatch(/runDisconnect\(source, 'server-and-local'\)/);
    expect(SETTINGS).toMatch(/Could not disconnect/);
    expect(SETTINGS).not.toMatch(/SecureStore/);
  });
});
