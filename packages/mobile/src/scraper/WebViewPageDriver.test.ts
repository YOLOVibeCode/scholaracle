import { extractSkywardStudentName, PAGE_FN_UNREGISTERED } from '@scholaracle/scraper-core';
import { WebViewPageDriver } from './WebViewPageDriver';

/**
 * Hermes gate: on Hermes, Function.prototype.toString returns
 * "function f(a0) { [bytecode] }". The driver must still send the real page
 * function source and must not rely on eval in the page.
 */
describe('WebViewPageDriver (Hermes-safe evaluate)', () => {
  const originalToString = Function.prototype.toString;

  beforeEach(() => {
    // eslint-disable-next-line no-extend-native
    Function.prototype.toString = function hermesToString(): string {
      return 'function f(a0) { [bytecode] }';
    };
  });

  afterEach(() => {
    // eslint-disable-next-line no-extend-native
    Function.prototype.toString = originalToString;
  });

  function setup(): { driver: WebViewPageDriver; injected: string[] } {
    const driver = new WebViewPageDriver();
    const injected: string[] = [];
    driver.attachInject((js) => injected.push(js));
    return { driver, injected };
  }

  function reply(driver: WebViewPageDriver, id: string, value: unknown): void {
    driver.webViewHandlers.onMessage({
      nativeEvent: {
        data: JSON.stringify({ channel: '__slc_bridge__', id, type: 'result', value }),
      },
    } as never);
  }

  it('injects the build-time source of a registered page function, with no eval and no bytecode', async () => {
    const { driver, injected } = setup();

    const pending = driver.evaluate(extractSkywardStudentName);
    reply(driver, '1', 'Ava Lewis');

    await expect(pending).resolves.toBe('Ava Lewis');
    expect(injected).toHaveLength(1);
    const script = injected[0]!;
    expect(script).toContain('function extractSkywardStudentName()');
    expect(script).not.toContain('[bytecode]');
    expect(script).not.toMatch(/\beval\s*\(/);
    expect(script).toContain('window.__slc_run__("1", (function extractSkywardStudentName()');
  });

  it('passes arguments as JSON', async () => {
    const { driver, injected } = setup();

    const pending = driver.content();
    reply(driver, '1', '<html></html>');

    await expect(pending).resolves.toBe('<html></html>');
    expect(injected[0]).toContain('function getDocumentOuterHtml()');
    expect(injected[0]).toContain('"[]"');
  });

  it('refuses a function that is not in the build-time table', async () => {
    const { driver, injected } = setup();

    await expect(driver.evaluate(() => document.title)).rejects.toThrow(PAGE_FN_UNREGISTERED);
    expect(injected).toHaveLength(0);
  });
});
