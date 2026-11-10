/**
 * Skyward recipe calls clickSkywardNavLink then waitForLoad; swap documents after each nav click.
 */
import type { BrowserFn } from '../driver/IPageDriver';
import { JsdomFixtureReplayDriver } from './jsdomFixtureReplayDriver';

export interface ISkywardNavReplayOptions {
  readonly fixtures: Readonly<Record<string, string>>;
  readonly initialUrl: string;
  readonly sectionUrls: Readonly<Record<string, string>>;
}

export class SkywardNavReplayDriver extends JsdomFixtureReplayDriver {
  private readonly _sectionUrls: Readonly<Record<string, string>>;

  constructor(options: ISkywardNavReplayOptions) {
    super({ fixtures: options.fixtures, initialUrl: options.initialUrl });
    this._sectionUrls = options.sectionUrls;
  }

  override async evaluate<TArgs extends unknown[], TResult>(
    fn: BrowserFn<TArgs, TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    const first = fn(...args);
    const result = first instanceof Promise ? await first : first;
    if (fn.name === 'clickSkywardNavLink') {
      const text = (args[0] as { text?: string } | undefined)?.text ?? '';
      const url = this._sectionUrls[text];
      if (url) await this.goto(url);
    }
    return result as TResult;
  }
}
