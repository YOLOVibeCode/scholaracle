/**
 * @jest-environment jsdom
 *
 * Locks M4-02 fake portal expected extraction sizes to the shared fixture module.
 */
import { runAeriesRecipe } from '../recipes/aeries-recipe';
import { runSkywardRecipe } from '../recipes/skyward-recipe';
import {
  assertFakePortalAeriesExtract,
  assertFakePortalSkywardExtract,
  mountFakePortalSkywardJsdomInteractivity,
} from './fakePortalConformance';
import { buildM402SkywardGradebookHtml, M402SimAeriesDriver } from './fakePortalM402';
import type { IPageDriver } from '../driver/IPageDriver';

const AERIES_ROOT = 'https://district.aeries.net/student/';

class SkywardJsdomDriver implements IPageDriver {
  async goto(): Promise<void> {}

  url(): string {
    return 'https://skyward.example.test/scripts/wsisa.dll/WService=x/sfgradebook001.w';
  }

  async evaluate<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult | Promise<TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    return fn(...args);
  }

  async content(): Promise<string> {
    return document.documentElement.outerHTML;
  }

  async waitForLoad(): Promise<void> {}

  async waitForUrlIncludes(): Promise<void> {}

  async sleep(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  onNewPage(): void {}
}

function mountSkywardFixture(): void {
  document.body.innerHTML = buildM402SkywardGradebookHtml();
  mountFakePortalSkywardJsdomInteractivity();
}

describe('fakePortalM402 expected counts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('matches runAeriesRecipe on M402SimAeriesDriver', async () => {
    const driver = new M402SimAeriesDriver(AERIES_ROOT);
    const result = await runAeriesRecipe(driver, AERIES_ROOT);
    assertFakePortalAeriesExtract(result);
  });

  it('matches runSkywardRecipe on M402 Skyward html', async () => {
    mountSkywardFixture();
    const extract = await runSkywardRecipe(
      new SkywardJsdomDriver(),
      'https://skyward.example.test'
    );
    assertFakePortalSkywardExtract(extract);
  });
});
