/**
 * @jest-environment jsdom
 *
 * Jsdom replay conformance: recipes through replay drivers against M4-02 fake portal HTML.
 */
import { runAeriesRecipe } from '../recipes/aeries-recipe';
import { runSkywardRecipe } from '../recipes/skyward-recipe';
import { JsdomFixtureReplayDriver } from '../__fixtures__/jsdomFixtureReplayDriver';
import {
  assertFakePortalAeriesExtract,
  assertFakePortalSkywardExtract,
  buildFakePortalSkywardJsdomFixtures,
  mountFakePortalSkywardJsdomInteractivity,
} from './fakePortalConformance';
import { M402SimAeriesDriver } from './fakePortalM402';

const AERIES_ROOT = 'https://district.aeries.net/student/';
const SKYWARD_ORIGIN = 'https://skyward.example.test';

describe('fake portal conformance (jsdom replay)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('aeries: M402 jsdom driver matches conformance table', async () => {
    const driver = new M402SimAeriesDriver(AERIES_ROOT);
    const extract = await runAeriesRecipe(driver, AERIES_ROOT);
    assertFakePortalAeriesExtract(extract);
  });

  it('skyward: JsdomFixtureReplayDriver matches conformance table', async () => {
    const { fixtures, initialUrl } = buildFakePortalSkywardJsdomFixtures(SKYWARD_ORIGIN);
    const driver = new JsdomFixtureReplayDriver({ fixtures, initialUrl });
    mountFakePortalSkywardJsdomInteractivity();
    const extract = await runSkywardRecipe(driver, SKYWARD_ORIGIN);
    assertFakePortalSkywardExtract(extract);
  });
});
