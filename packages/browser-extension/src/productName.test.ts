/**
 * The product is Scholarmancy. The extension's name in the manifest already says so; these
 * tests keep everything else a person reads in line with it: the toolbar tooltip, the popup,
 * the settings page, the API address it suggests and the "login required" notification.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromeMock, resetChromeMock } from './test/chrome-mock';

const PACKAGE_ROOT = join(__dirname, '..');

function read(file: string): string {
  return readFileSync(join(PACKAGE_ROOT, file), 'utf8');
}

interface IManifest {
  readonly name: string;
  readonly action?: { readonly default_title?: string };
}

function manifest(file: string): IManifest {
  return JSON.parse(read(file)) as IManifest;
}

describe('the name people read in the extension', () => {
  it.each(['manifest.json', 'manifest.e2e.json'])(
    '%s: the toolbar tooltip says Scholarmancy Sync',
    (file) => {
      const { name, action } = manifest(file);

      expect(name.startsWith('Scholarmancy Sync')).toBe(true);
      expect(action?.default_title).toBe('Scholarmancy Sync');
    }
  );

  it.each(['popup.html', 'options.html'])('%s does not say Scholaracle anywhere', (file) => {
    expect(read(file)).not.toMatch(/scholaracle/i);
  });

  it('the popup is titled Scholarmancy Sync', () => {
    const html = read('popup.html');

    expect(html).toContain('<title>Scholarmancy Sync</title>');
    expect(html).toContain('<h1>Scholarmancy Sync</h1>');
  });

  it('the settings page is titled Scholarmancy Sync and suggests the real API address', () => {
    const html = read('options.html');

    expect(html).toContain('<title>Scholarmancy Sync — Settings</title>');
    expect(html).toContain('<h1>Scholarmancy Sync</h1>');
    expect(html).toContain('placeholder="https://api.scholarmancy.com"');
  });
});

describe('the "login required" notification', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('is titled with the product name', async () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./background/service-worker');
    });
    const onMessage = chromeMock.runtime.onMessage.addListener.mock.calls[0]?.[0] as
      | ((message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean)
      | undefined;
    expect(onMessage).toBeDefined();

    onMessage?.(
      {
        type: 'SYNC_FAILED',
        runId: 'run-1',
        errorMessage: 'session expired',
        requiresLogin: true,
        provider: 'skyward',
        baseUrl: 'https://skyward.example.test',
      },
      {},
      () => undefined
    );
    // The handler is fire-and-forget; let its awaits finish.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    expect(chromeMock.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Scholarmancy: Login required',
        contextMessage: 'https://skyward.example.test',
      })
    );
  });
});
