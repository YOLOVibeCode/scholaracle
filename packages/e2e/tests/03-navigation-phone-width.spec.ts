import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';

/**
 * Layer 3: Navigation at a phone width (Parent)
 *
 * No dashboard page is wider than the screen. A page that is wider scrolls sideways as a whole
 * and starts with its right side off the screen: the end of a row, a button. The causes so far
 * were a box that could not shrink and rows that could not wrap, so the pages themselves are
 * measured, with the data the seed gives the parent.
 *
 * Depends on: Layer 2 (@dashboard)
 * If Layer 2 fails → don't run
 */
const PHONE = { width: 375, height: 812 } as const;

/** The pages a parent reaches from the sidebar. */
const SIDEBAR_PAGES = [
  '/dashboard',
  '/dashboard/students',
  '/dashboard/alerts',
  '/dashboard/agenda',
  '/dashboard/courses',
  '/dashboard/integrations',
  '/dashboard/billing',
  '/dashboard/account',
  '/dashboard/email-history',
  '/dashboard/settings',
] as const;

/** The tabs of a student's page, by the value of `?tab=`. */
const STUDENT_TABS = [
  'overview',
  'sources',
  'alerts',
  'activity',
  'grades',
  'documents',
  'parents',
  'trends',
] as const;

/** The pages under "View as student". */
const VIEW_AS_STUDENT_PAGES = ['', '/agenda', '/alerts', '/courses', '/emails', '/todo'] as const;

/** How many pixels of the page lie to the right of the screen. 0 when the page fits. */
async function pixelsPastTheScreen(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
  );
}

/** Opens a page and gives its data time to arrive before anything is measured. */
async function openAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('[data-testid="button-logout"]')).toBeVisible({ timeout: 15000 });
  // A page that keeps a request open never goes quiet. It is measured anyway after the wait.
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
}

async function expectFitsTheScreen(page: Page, url: string): Promise<void> {
  await openAndSettle(page, url);
  expect.soft(await pixelsPastTheScreen(page), `${url}: pixels past the right edge`).toBe(0);
}

/** The id of the first student on the parent's list. */
async function firstStudentId(page: Page): Promise<string> {
  await openAndSettle(page, '/dashboard/students');
  const card = page.locator('[data-testid^="student-card-"]').first();
  await expect(card).toBeVisible({ timeout: 10000 });
  const testId = (await card.getAttribute('data-testid')) ?? '';
  return testId.replace('student-card-', '');
}

test.describe('@navigation Layer 3: Parent navigation at a phone width', () => {
  test.use({ viewport: PHONE });

  test.beforeEach(async ({ loginAsRole }) => {
    await loginAsRole('parent');
  });

  test('NAV-PHONE-001: no sidebar page is wider than the screen', async ({ page }) => {
    test.slow();

    for (const url of SIDEBAR_PAGES) {
      await expectFitsTheScreen(page, url);
    }
  });

  test('NAV-PHONE-002: a student page fits on every tab, with its buttons on the screen', async ({
    page,
  }) => {
    test.slow();
    const studentId = await firstStudentId(page);

    for (const tab of STUDENT_TABS) {
      await expectFitsTheScreen(page, `/dashboard/students/${studentId}?tab=${tab}`);
    }

    // The buttons of the header and the last tab end on the screen, not past it.
    await expect(page.locator('[data-testid="student-tabs"]')).toBeVisible();
    for (const id of ['button-workflow', 'button-view-as-student', 'tab-trends']) {
      const box = await page.locator(`[data-testid="${id}"]`).boundingBox();
      expect(box, id).not.toBeNull();
      expect.soft(box!.x + box!.width, `${id} ends on the screen`).toBeLessThanOrEqual(PHONE.width);
    }
  });

  test('NAV-PHONE-003: the pages behind a student page fit: grades, workflow, runs and "View as student"', async ({
    page,
  }) => {
    test.slow();
    const studentId = await firstStudentId(page);

    for (const path of ['/grades', '/workflow', '/runs']) {
      await expectFitsTheScreen(page, `/dashboard/students/${studentId}${path}`);
    }
    for (const path of VIEW_AS_STUDENT_PAGES) {
      await expectFitsTheScreen(page, `/dashboard/students/${studentId}/view${path}`);
    }
  });

  test('NAV-PHONE-004: the grades page shows the course list above the grades, not beside them', async ({
    page,
  }) => {
    const studentId = await firstStudentId(page);
    await openAndSettle(page, `/dashboard/students/${studentId}/grades`);

    const list = page.locator('[data-testid="grades-course-list"]');
    const grades = page.locator('[data-testid="grades-content"]');
    await expect(grades).toBeVisible({ timeout: 10000 });
    const listBox = await list.boundingBox();
    const gradesBox = await grades.boundingBox();
    expect(listBox).not.toBeNull();
    expect(gradesBox).not.toBeNull();

    expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(gradesBox!.y + 1);
    // Beside the list the grades had 170 px. Above them they have the width of the page.
    expect(gradesBox!.width).toBeGreaterThanOrEqual(300);
  });
});
