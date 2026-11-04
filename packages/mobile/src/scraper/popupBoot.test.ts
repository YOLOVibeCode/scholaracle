import vm from 'node:vm';
import { POPUP_BOOT_JS, shouldFollowOpenWindow } from './popupBoot';
import { WebViewPageDriver } from './WebViewPageDriver';

interface IFakeNode {
  nodeType: number;
  tagName?: string;
  target?: string;
  parentNode?: IFakeNode | null;
}

/** Run POPUP_BOOT_JS against a minimal fake window/document. */
function boot(times = 1): {
  win: { open: (url?: unknown, name?: string) => unknown };
  assigned: string[];
  submittedTargets: Array<string | undefined>;
  dispatch: (type: string, target: IFakeNode) => void;
  listenerCount: (type: string) => number;
  FormCtor: { prototype: { submit: (this: IFakeNode) => void } };
} {
  const listeners: Record<string, Array<(e: { target: IFakeNode }) => void>> = {};
  const assigned: string[] = [];
  const submittedTargets: Array<string | undefined> = [];
  function HTMLFormElement(): void {}
  HTMLFormElement.prototype.submit = function submit(this: IFakeNode): void {
    submittedTargets.push(this.target);
  };
  const win: Record<string, unknown> = {
    location: { assign: (u: string): number => assigned.push(u) },
    HTMLFormElement,
  };
  const document = {
    addEventListener: (type: string, fn: (e: { target: IFakeNode }) => void): void => {
      (listeners[type] ??= []).push(fn);
    },
  };
  const ctx = vm.createContext({ window: win, document });
  for (let i = 0; i < times; i++) vm.runInContext(POPUP_BOOT_JS, ctx);
  return {
    win: win as unknown as { open: (url?: unknown, name?: string) => unknown },
    assigned,
    submittedTargets,
    dispatch: (type, target): void => {
      for (const fn of listeners[type] ?? []) fn({ target });
    },
    listenerCount: (type): number => (listeners[type] ?? []).length,
    FormCtor: HTMLFormElement as unknown as { prototype: { submit: (this: IFakeNode) => void } },
  };
}

describe('POPUP_BOOT_JS (same-frame popups)', () => {
  it('turns window.open(url) into a same-frame navigation and returns window', () => {
    const env = boot();
    const result = env.win.open('/scripts/wsisa.dll/WService=x/sfhome01.w', '_blank');
    expect(env.assigned).toEqual(['/scripts/wsisa.dll/WService=x/sfhome01.w']);
    expect(result).toBe(env.win);
  });

  it('ignores empty, about:blank and javascript: opens without navigating', () => {
    const env = boot();
    expect(env.win.open()).toBe(env.win);
    expect(env.win.open('', 'gradeWin')).toBe(env.win);
    expect(env.win.open('about:blank')).toBe(env.win);
    expect(env.win.open('javascript:void(0)')).toBe(env.win);
    expect(env.assigned).toEqual([]);
  });

  it('forces a form posting into another window to submit to _self (POST body kept)', () => {
    const env = boot();
    const form: IFakeNode = { nodeType: 1, tagName: 'FORM', target: 'gradeWin' };
    env.dispatch('submit', form);
    expect(form.target).toBe('_self');
  });

  it('forces programmatic form.submit() to _self before submitting', () => {
    const env = boot();
    const form: IFakeNode = { nodeType: 1, tagName: 'FORM', target: '_blank' };
    env.FormCtor.prototype.submit.call(form);
    expect(env.submittedTargets).toEqual(['_self']);
  });

  it('forces target="_blank" links to _self, including clicks on a child element', () => {
    const env = boot();
    const link: IFakeNode = { nodeType: 1, tagName: 'A', target: '_blank', parentNode: null };
    const span: IFakeNode = { nodeType: 1, tagName: 'SPAN', parentNode: link };
    env.dispatch('click', span);
    expect(link.target).toBe('_self');
  });

  it('leaves links without a target alone', () => {
    const env = boot();
    const link: IFakeNode = { nodeType: 1, tagName: 'A', target: '', parentNode: null };
    env.dispatch('click', link);
    expect(link.target).toBe('');
  });

  it('installs once even when injected twice', () => {
    const env = boot(2);
    expect(env.listenerCount('submit')).toBe(1);
    expect(env.listenerCount('click')).toBe(1);
    const form: IFakeNode = { nodeType: 1, tagName: 'FORM', target: '_blank' };
    env.FormCtor.prototype.submit.call(form);
    expect(env.submittedTargets).toEqual(['_self']);
  });
});

describe('shouldFollowOpenWindow', () => {
  it('follows http(s) popups', () => {
    expect(
      shouldFollowOpenWindow({
        targetUrl: 'https://skyward.iscorp.com/sfhome01.w',
        lastFollowedUrl: null,
        msSinceLastFollow: Infinity,
      })
    ).toBe(true);
  });

  it('drops non-http(s) targets', () => {
    for (const targetUrl of ['about:blank', 'javascript:void(0)', 'intent://x', '']) {
      expect(
        shouldFollowOpenWindow({ targetUrl, lastFollowedUrl: null, msSinceLastFollow: Infinity })
      ).toBe(false);
    }
  });

  it('drops a repeat of the popup it just opened, but allows it again later', () => {
    const url = 'https://skyward.iscorp.com/sfhome01.w';
    expect(
      shouldFollowOpenWindow({ targetUrl: url, lastFollowedUrl: url, msSinceLastFollow: 100 })
    ).toBe(false);
    expect(
      shouldFollowOpenWindow({ targetUrl: url, lastFollowedUrl: url, msSinceLastFollow: 6000 })
    ).toBe(true);
  });
});

describe('WebViewPageDriver.openInSameFrame', () => {
  function setup(): { driver: WebViewPageDriver; injected: string[] } {
    const driver = new WebViewPageDriver();
    const injected: string[] = [];
    driver.attachInject((js) => injected.push(js));
    return { driver, injected };
  }

  it('navigates the same frame once, with no loop on repeated requests', () => {
    const { driver, injected } = setup();
    const url = 'https://skyward.iscorp.com/scripts/wsisa.dll/WService=x/sfhome01.w';
    expect(driver.openInSameFrame(url, 1000)).toBe(true);
    // The page re-requests the same window while it loads: dropped.
    for (let t = 1100; t < 2000; t += 100) {
      expect(driver.openInSameFrame(url, t)).toBe(false);
    }
    expect(injected).toHaveLength(1);
    expect(injected[0]).toContain(`window.location.assign(${JSON.stringify(url)})`);
  });

  it('follows a different popup right away', () => {
    const { driver, injected } = setup();
    expect(driver.openInSameFrame('https://a.example/1', 1000)).toBe(true);
    expect(driver.openInSameFrame('https://a.example/2', 1001)).toBe(true);
    expect(injected).toHaveLength(2);
  });

  it('handlePopupNavigation does not wait for a load when no handler is registered', async () => {
    const { driver, injected } = setup();
    await expect(driver.handlePopupNavigation('https://a.example/1')).resolves.toBeUndefined();
    expect(injected).toHaveLength(1);
  });
});
