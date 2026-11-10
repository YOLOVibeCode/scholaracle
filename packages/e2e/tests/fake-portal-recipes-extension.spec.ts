/**
 * Extension ContentScriptPageDriver conformance against the fake portal (E2E manifest build).
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  FAKE_PORTAL_RECIPE_CONFORMANCE,
  assertFakePortalAeriesExtract,
  assertFakePortalSkywardExtract,
} from '../../scraper-core/src/fixtures/fakePortalConformance';
import type { IAeriesFullExtract } from '../../scraper-core/src/extractors/aeries/aeries-extractors';
import type { ISkywardFullExtract } from '../../scraper-core/src/extractors/skyward/skyward-extractors';
import { fakePortalOrigin, loginFakePortal } from '../helpers/fakePortalLogin';
import { launchExtensionConformanceContext } from '../helpers/extensionPersistentContext';

const EXTENSION_DIST = join(__dirname, '../../browser-extension/dist');

test.describe('fake portal recipes extension @local-only', () => {
  test.beforeAll(() => {
    expect(
      existsSync(join(EXTENSION_DIST, 'manifest.json')),
      'Run SCHOLARMANCY_EXTENSION_E2E=1 pnpm --filter @scholaracle/browser-extension build before this project'
    ).toBe(true);
    expect(existsSync(join(EXTENSION_DIST, 'e2e-conformance.js'))).toBe(true);
  });

  for (const entry of FAKE_PORTAL_RECIPE_CONFORMANCE) {
    test(`ContentScriptPageDriver ${entry.id}: runRecipe matches conformance table`, async () => {
      const { context, page } = await launchExtensionConformanceContext();
      try {
        await loginFakePortal(page, entry.login.startPath, entry.login.expectPathPart);
        await page.waitForFunction(
          () => typeof window.__scholaracleFakePortalConformance?.kickoff === 'function',
          undefined,
          { timeout: 30_000 }
        );
        const root = entry.recipeRoot(fakePortalOrigin());
        await page.evaluate(
          ({ recipeId, recipeRoot }) => {
            const hook = window.__scholaracleFakePortalConformance;
            if (!hook) throw new Error('E2E conformance hook missing');
            hook.kickoff(recipeId, recipeRoot);
          },
          { recipeId: entry.id, recipeRoot: root }
        );
        await page.waitForFunction(
          () =>
            window.__scholaracleConformanceResult !== undefined ||
            window.__scholaracleConformanceError !== undefined,
          undefined,
          { timeout: 120_000 }
        );
        const errText = await page.evaluate(() => window.__scholaracleConformanceError);
        if (errText) throw new Error(errText);
        const payload = await page.evaluate(() => window.__scholaracleConformanceResult);
        if (entry.id === 'aeries') {
          assertFakePortalAeriesExtract(payload as IAeriesFullExtract);
        } else {
          assertFakePortalSkywardExtract(payload as ISkywardFullExtract);
        }
      } finally {
        await context.close();
      }
    });
  }
});
