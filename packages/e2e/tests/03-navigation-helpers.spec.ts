import { test, expect } from '@playwright/test';
import { navigateBack } from '../helpers/navigation';

/**
 * Layer 3: Navigation helpers
 *
 * These tests check the helpers themselves, on pages served from inside the test.
 * They need no server, no sign-in and no seeded data, so they behave the same on a
 * laptop, in CI and against a deployed environment.
 */
test.describe('@navigation Layer 3: Navigation helpers', () => {
  // A helper that waits for something that never comes should fail here in seconds,
  // not after the suite's full minute on each attempt.
  test.setTimeout(15 * 1000);

  test('NAV-H-001: navigateBack returns while a request on the page is still open', async ({
    page,
  }) => {
    const origin = 'http://navigation-helper.test';

    // Every page starts one request that is never answered, so the network never goes quiet.
    // That is what the dashboard looked like in the CI run where NAV-P-008 timed out three
    // times on a page that was complete.
    await page.route(`${origin}/**`, async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/open-request') {
        return; // left open on purpose
      }
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><title>${pathname}</title><h1>${pathname}</h1><script>void fetch('/open-request').catch(() => undefined);</script>`,
      });
    });

    await page.goto(`${origin}/first`);
    await page.goto(`${origin}/second`);

    await navigateBack(page);

    await expect(page).toHaveURL(`${origin}/first`);
    await expect(page.locator('h1')).toHaveText('/first');
  });
});
