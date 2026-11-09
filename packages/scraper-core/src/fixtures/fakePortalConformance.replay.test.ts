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
  buildFakePortalJsdomFixtures,
  mountFakePortalSkywardJsdomInteractivity,
} from './fakePortalConformance';
import { M402SimAeriesDriver } from './fakePortalM402';

const AERIES_ROOT = 'https://district.aeries.net/student/';
const SKYWARD_ORIGIN = 'https://skyward.example.test';
const JSDOM_FIXTURES = buildFakePortalJsdomFixtures(AERIES_ROOT, SKYWARD_ORIGIN);

describe('fake portal conformance (jsdom replay)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('aeries: M402 jsdom driver matches conformance table', async () => {
    const driver = new M402SimAeriesDriver(JSDOM_FIXTURES.aeriesStudentRoot);
    const extract = await runAeriesRecipe(driver, JSDOM_FIXTURES.aeriesStudentRoot);
    assertFakePortalAeriesExtract(extract);
  });

  it('skyward: JsdomFixtureReplayDriver matches conformance table', async () => {
    const { fixtures, initialUrl } = JSDOM_FIXTURES.skyward;
    const driver = new JsdomFixtureReplayDriver({ fixtures, initialUrl });
    mountFakePortalSkywardJsdomInteractivity();
    const extract = await runSkywardRecipe(driver, SKYWARD_ORIGIN);
    assertFakePortalSkywardExtract(extract);
  });
});
