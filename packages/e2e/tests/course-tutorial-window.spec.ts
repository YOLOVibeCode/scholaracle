/**
 * Parent edits tutorial window on grades drill-down (mocked API).
 */
import { test, expect } from '../fixtures/auth';

test.describe('@feature Course tutorial window', () => {
  test('shows tutorial field and saves via PATCH', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');

    const studentId = '507f1f77bcf86cd799439011';
    const mergedCourseId = 'algebra-1';

    await page.route(`**/api/students/${studentId}/grades`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          studentId,
          studentName: 'Emma',
          overallGPA: 3.5,
          atRiskCourses: 0,
          courseGrades: [
            {
              courseExternalId: mergedCourseId,
              courseName: 'Algebra 1',
              officialGrade: 92,
              totalAssignments: 1,
              gradedAssignments: 1,
              missingAssignments: 0,
              lateAssignments: 0,
              totalPointsPossible: 100,
              totalPointsEarned: 92,
              recentTrend: 'stable',
              riskLevel: 'low',
              materialCount: 0,
              classMeetingSummary: 'Period 3 · Tue/Thu · 9:00–9:50',
              tutorialWindow: 'Tue/Thu 7:15–7:45 AM',
              isTutorialManual: false,
              canResetTutorial: false,
              assignments: [],
            },
          ],
        }),
      });
    });

    let patchBody: unknown;
    await page.route(
      `**/api/students/${studentId}/courses/${encodeURIComponent(mergedCourseId)}/tutorial`,
      async (route) => {
        if (route.request().method() === 'PATCH') {
          patchBody = route.request().postDataJSON();
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ tutorialWindow: 'Wed 8:00 AM' }),
          });
          return;
        }
        await route.continue();
      }
    );

    await page.goto(`/dashboard/students/${studentId}/grades`);
    await page.getByTestId('input-tutorial-window').waitFor();
    await page.getByTestId('input-tutorial-window').fill('Wed 8:00 AM');
    await page.getByTestId('btn-save-tutorial').click();

    await expect.poll(() => patchBody).toEqual({ tutorialWindow: 'Wed 8:00 AM' });
  });
});
