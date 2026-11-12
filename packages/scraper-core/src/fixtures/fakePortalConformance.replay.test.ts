/**
 * @jest-environment jsdom
 *
 * Jsdom replay conformance: recipes through replay drivers against M4-02 fake portal HTML.
 */
import { runAeriesRecipe } from '../recipes/aeries-recipe';
import { runSkywardRecipe } from '../recipes/skyward-recipe';
import { FakePortalAeriesReplayDriver } from '../__fixtures__/fakePortalAeriesReplayDriver';
import { JsdomFixtureReplayDriver } from '../__fixtures__/jsdomFixtureReplayDriver';
import {
  assertFakePortalAeriesExtract,
  assertFakePortalSkywardExtract,
  buildFakePortalJsdomFixtures,
  mountFakePortalSkywardJsdomInteractivity,
} from './fakePortalConformance';

const AERIES_ROOT = 'https://district.aeries.net/student/';
const SKYWARD_ORIGIN = 'https://skyward.example.test';
const JSDOM_FIXTURES = buildFakePortalJsdomFixtures(AERIES_ROOT, SKYWARD_ORIGIN);

describe('fake portal conformance (jsdom replay)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('aeries: JsdomFixtureReplayDriver matches conformance table', async () => {
    const driver = new FakePortalAeriesReplayDriver(JSDOM_FIXTURES.aeries);
    const extract = await runAeriesRecipe(driver, AERIES_ROOT);
    assertFakePortalAeriesExtract(extract);
    // Ben has no attendance rows, so the recipe waits out its 20 s attendance-ready window.
  }, 60_000);

  it('skyward: JsdomFixtureReplayDriver matches conformance table', async () => {
    const { fixtures, initialUrl } = JSDOM_FIXTURES.skyward;
    const driver = new JsdomFixtureReplayDriver({ fixtures, initialUrl });
    mountFakePortalSkywardJsdomInteractivity();
    const extract = await runSkywardRecipe(driver, SKYWARD_ORIGIN);
    assertFakePortalSkywardExtract(extract);
  });
});
