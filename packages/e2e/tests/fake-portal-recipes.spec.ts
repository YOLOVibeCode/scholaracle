/**
 * Playwright replay: run Aeries/Skyward recipes against the fake portal server
 * (strict CSP, deferred widget hydration). Start scripts/fake-portal-server.mjs on port 2855.
 */
import { test } from '@playwright/test';
import { createPlaywrightDriver } from '../../scraper-playwright/src/playwright-driver';
import { runAeriesRecipe } from '../../scraper-core/src/recipes/aeries-recipe';
import { runSkywardRecipe } from '../../scraper-core/src/recipes/skyward-recipe';
import {
  FAKE_PORTAL_RECIPE_CONFORMANCE,
  assertFakePortalAeriesExtract,
  assertFakePortalSkywardExtract,
} from '../../scraper-core/src/fixtures/fakePortalConformance';
import { fakePortalOrigin, loginFakePortal } from '../helpers/fakePortalLogin';

test.describe('fake portal recipes @local-only', () => {
  for (const entry of FAKE_PORTAL_RECIPE_CONFORMANCE) {
    test(`Playwright ${entry.id}: runRecipe matches conformance table`, async () => {
      const { driver, browser } = await createPlaywrightDriver({ headless: true });
      try {
        await loginFakePortal(driver.page, entry.login.startPath, entry.login.expectPathPart);
        const root = entry.recipeRoot(fakePortalOrigin());
        if (entry.id === 'aeries') {
          const result = await runAeriesRecipe(driver, root);
          assertFakePortalAeriesExtract(result);
        } else {
          const extract = await runSkywardRecipe(driver, root);
          assertFakePortalSkywardExtract(extract);
        }
      } finally {
        await browser.close();
      }
    });
  }
});
