/**
 * Playwright replay: run Aeries/Skyward recipes against the fake portal server
 * (strict CSP, deferred widget hydration). Start scripts/fake-portal-server.mjs on port 2855.
 */
import { test, expect } from '@playwright/test';
import { createPlaywrightDriver } from '../../scraper-playwright/src/playwright-driver';
import { runAeriesRecipe } from '../../scraper-core/src/recipes/aeries-recipe';
import { runSkywardRecipe } from '../../scraper-core/src/recipes/skyward-recipe';
import {
  FAKE_PORTAL_AERIES_EXPECTED,
  FAKE_PORTAL_SKYWARD_EXPECTED,
  FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH,
} from '../../scraper-core/src/fixtures/fakePortalM402';
import type { Page } from '@playwright/test';

const FAKE_ORIGIN = process.env.FAKE_PORTAL_ORIGIN ?? 'http://127.0.0.1:2855';

async function loginDemo(page: Page, startPath: string, expectPathPart: string): Promise<void> {
  await page.goto(`${FAKE_ORIGIN}${startPath}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="input-username"]', { timeout: 45_000 });
  await page.getByTestId('input-username').fill('demo');
  await page.getByTestId('input-password').fill('demo');
  await page.getByTestId('btn-submit').click();
  await page.waitForURL(new RegExp(expectPathPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

test.describe('fake portal recipes', () => {
  test('Aeries: runAeriesRecipe matches expected counts', async () => {
    const { driver, browser } = await createPlaywrightDriver({ headless: true });
    try {
      await loginDemo(
        driver.page,
        '/fake-aeries/student/LoginParent.aspx?csp=strict',
        '/fake-aeries/student/Dashboard.aspx'
      );
      const result = await runAeriesRecipe(driver, `${FAKE_ORIGIN}/fake-aeries/student/`);

      expect(result.students.map((s) => s.name)).toEqual([...FAKE_PORTAL_AERIES_EXPECTED.studentNames]);
      const [ann, ben] = result.students;
      expect(ann!.courses).toHaveLength(FAKE_PORTAL_AERIES_EXPECTED.ann.courseCount);
      expect(ann!.courses.reduce((n, c) => n + c.assignments.length, 0)).toBe(
        FAKE_PORTAL_AERIES_EXPECTED.ann.totalAssignments
      );
      expect(ann!.attendance).toHaveLength(FAKE_PORTAL_AERIES_EXPECTED.ann.attendanceCount);

      expect(ben!.courses).toHaveLength(FAKE_PORTAL_AERIES_EXPECTED.ben.courseCount);
      expect(ben!.courses.reduce((n, c) => n + c.assignments.length, 0)).toBe(
        FAKE_PORTAL_AERIES_EXPECTED.ben.totalAssignments
      );
      expect(ben!.attendance).toHaveLength(FAKE_PORTAL_AERIES_EXPECTED.ben.attendanceCount);
    } finally {
      await browser.close();
    }
  });

  test('Skyward: runSkywardRecipe matches expected counts', async () => {
    const { driver, browser } = await createPlaywrightDriver({ headless: true });
    try {
      const gbPath = FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH;
      await loginDemo(driver.page, `/skyward/login?next=${encodeURIComponent(gbPath)}&csp=strict`, gbPath);

      const extract = await runSkywardRecipe(driver, FAKE_ORIGIN);

      expect(extract.courses).toHaveLength(FAKE_PORTAL_SKYWARD_EXPECTED.courseCount);
      expect(extract.assignments).toHaveLength(FAKE_PORTAL_SKYWARD_EXPECTED.assignmentRowCount);
      expect(extract.courses.map((c) => c.name).sort()).toEqual(
        [...FAKE_PORTAL_SKYWARD_EXPECTED.courseNames].sort()
      );
    } finally {
      await browser.close();
    }
  });
});
