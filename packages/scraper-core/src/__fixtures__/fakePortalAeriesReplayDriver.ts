/**
 * Replays the fake Aeries portal in jsdom. The portal keeps the selected student in the
 * session and serves the same URLs for either one, so each student has its own
 * JsdomFixtureReplayDriver and ChangeStudent.aspx swaps which one is live.
 */

import type { BrowserFn, IGotoOptions, IPageDriver, IWaitOptions } from '../driver/IPageDriver';
import type {
  FakePortalAeriesStudentKey,
  IFakePortalAeriesJsdomFixtures,
} from '../fixtures/fakePortalConformance';
import { JsdomFixtureReplayDriver } from './jsdomFixtureReplayDriver';

export class FakePortalAeriesReplayDriver implements IPageDriver {
  private readonly _pages: Readonly<Record<FakePortalAeriesStudentKey, JsdomFixtureReplayDriver>>;
  private readonly _dashboardUrl: string;
  private readonly _switchStudentUrl: string;
  private _student: FakePortalAeriesStudentKey = 'A';

  constructor(fixtures: IFakePortalAeriesJsdomFixtures) {
    this._dashboardUrl = fixtures.initialUrl;
    this._switchStudentUrl = fixtures.switchStudentUrl;
    this._pages = {
      A: new JsdomFixtureReplayDriver({
        fixtures: fixtures.fixturesByStudent.A,
        initialUrl: fixtures.initialUrl,
      }),
      B: new JsdomFixtureReplayDriver({ fixtures: fixtures.fixturesByStudent.B }),
    };
  }

  async goto(url: string, options?: IGotoOptions): Promise<void> {
    if (url.startsWith(this._switchStudentUrl)) {
      this._student = this._student === 'A' ? 'B' : 'A';
      await this._page().goto(this._dashboardUrl, options);
      return;
    }
    await this._page().goto(url, options);
  }

  url(): string {
    return this._page().url();
  }

  evaluate<TArgs extends unknown[], TResult>(
    fn: BrowserFn<TArgs, TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    return this._page().evaluate(fn, ...args);
  }

  content(): Promise<string> {
    return this._page().content();
  }

  waitForLoad(options?: IWaitOptions): Promise<void> {
    return this._page().waitForLoad(options);
  }

  waitForUrlIncludes(pattern: string, options?: IWaitOptions): Promise<void> {
    return this._page().waitForUrlIncludes(pattern, options);
  }

  sleep(ms: number): Promise<void> {
    return this._page().sleep(ms);
  }

  onNewPage(handler: (page: IPageDriver) => Promise<void>): void {
    this._page().onNewPage(handler);
  }

  private _page(): JsdomFixtureReplayDriver {
    return this._pages[this._student];
  }
}
