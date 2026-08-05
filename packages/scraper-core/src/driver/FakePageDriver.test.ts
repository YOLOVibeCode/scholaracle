/**
 * FakePageDriver tests — written first (TDD M1).
 */

import { FakePageDriver } from './FakePageDriver';

describe('FakePageDriver', () => {
  it('should start at initialUrl or about:blank', () => {
    expect(new FakePageDriver().url()).toBe('about:blank');
    expect(new FakePageDriver({ initialUrl: 'https://a.example' }).url()).toBe('https://a.example');
  });

  it('should record goto history and update url', async () => {
    const driver = new FakePageDriver();
    await driver.goto('https://portal.example/login');
    await driver.goto('https://portal.example/home');
    expect(driver.url()).toBe('https://portal.example/home');
    expect(driver.gotoHistory).toEqual([
      'https://portal.example/login',
      'https://portal.example/home',
    ]);
  });

  it('should return fixture html from content()', async () => {
    const driver = new FakePageDriver({
      fixtures: {
        'https://portal.example': { html: '<html><body>fixture</body></html>' },
      },
      initialUrl: 'https://portal.example',
    });
    expect(await driver.content()).toBe('<html><body>fixture</body></html>');
  });

  it('should match fixtures by URL prefix', async () => {
    const driver = new FakePageDriver({
      fixtures: {
        'https://portal.example': { html: 'root' },
        'https://portal.example/grades': { html: 'grades' },
      },
    });
    await driver.goto('https://portal.example/grades?term=1');
    expect(await driver.content()).toBe('grades');
  });

  it('should return evaluateResults in order then fall back', async () => {
    const driver = new FakePageDriver({
      fixtures: {
        'https://portal.example': {
          evaluateResults: ['first', 'second'],
        },
      },
      initialUrl: 'https://portal.example',
    });
    const identity = <T>(v: T): T => v;
    expect(await driver.evaluate(identity, 'ignored')).toBe('first');
    expect(await driver.evaluate(identity, 'ignored')).toBe('second');
    expect(await driver.evaluate(identity, 'live')).toBe('live');
    expect(driver.evaluateCallCount.value).toBe(3);
  });

  it('should resolve waitForUrlIncludes when pattern matches', async () => {
    const driver = new FakePageDriver({ initialUrl: 'https://portal.example/dashboard' });
    await expect(driver.waitForUrlIncludes('dashboard')).resolves.toBeUndefined();
  });

  it('should reject waitForUrlIncludes when pattern does not match', async () => {
    const driver = new FakePageDriver({ initialUrl: 'https://portal.example/login' });
    await expect(driver.waitForUrlIncludes('dashboard')).rejects.toThrow(/does not include/);
  });

  it('should invoke onNewPage handler via simulateNewPage', async () => {
    const driver = new FakePageDriver();
    const seen: string[] = [];
    driver.onNewPage(async (page) => {
      seen.push(page.url());
    });
    await driver.simulateNewPage();
    expect(seen).toEqual(['about:blank']);
  });

  it('should sleep as a no-op', async () => {
    const driver = new FakePageDriver();
    const start = Date.now();
    await driver.sleep(5000);
    expect(Date.now() - start).toBeLessThan(50);
  });
});
