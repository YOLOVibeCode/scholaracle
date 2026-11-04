/**
 * Same-frame popup policy for portal WebViews.
 *
 * Portals such as Skyward open their pages in new windows: window.open(url),
 * links with target="_blank", and forms that POST into a named window. A
 * WebView has no second window, so these must continue in the same frame.
 *
 * POPUP_BOOT_JS runs before the page's own scripts
 * (injectedJavaScriptBeforeContentLoaded). It:
 *   - replaces window.open with a same-frame navigation and returns `window`,
 *     so code that writes `w.location = …` on the result still works;
 *   - forces form.target and link target to "_self" at submit and click time,
 *     so POST bodies survive (a re-sent URL would lose them);
 *   - patches HTMLFormElement.prototype.submit, which does not fire "submit".
 *
 * onOpenWindow on the WebView is the fallback for windows the boot script did
 * not catch (Android can run page scripts before early injection lands).
 *
 * This replaces the old intercept of navigationType === "other", which
 * re-sent every Skyward navigation as another "other" navigation: an endless
 * loop on iOS, and never triggered on Android.
 */

export const POPUP_BOOT_JS = `(function () {
  if (window.__slc_popup_boot__) return;
  window.__slc_popup_boot__ = true;
  var go = function (url) {
    if (url === undefined || url === null) return window;
    var s = String(url);
    if (s === '' || s === 'about:blank') return window;
    if (/^\\s*javascript:/i.test(s)) return window;
    window.location.assign(s);
    return window;
  };
  window.open = function (url) { return go(url); };
  var toSelf = function (el) {
    if (el && el.target && el.target !== '_self') el.target = '_self';
  };
  document.addEventListener('submit', function (e) { toSelf(e.target); }, true);
  document.addEventListener('click', function (e) {
    var n = e.target;
    while (n && n.nodeType === 1 && n.tagName !== 'A') n = n.parentNode;
    if (n && n.nodeType === 1) toSelf(n);
  }, true);
  if (window.HTMLFormElement && window.HTMLFormElement.prototype) {
    var submit = window.HTMLFormElement.prototype.submit;
    window.HTMLFormElement.prototype.submit = function () {
      toSelf(this);
      return submit.apply(this, arguments);
    };
  }
})();
true;`;

/**
 * Decide whether an onOpenWindow request should continue in the same frame.
 * Only http(s) URLs are followed; a repeat of the URL being opened right now
 * is dropped so a page that re-opens on every load cannot loop.
 */
export function shouldFollowOpenWindow(params: {
  readonly targetUrl: string;
  readonly lastFollowedUrl: string | null;
  readonly msSinceLastFollow: number;
}): boolean {
  const { targetUrl, lastFollowedUrl, msSinceLastFollow } = params;
  if (!/^https?:\/\//i.test(targetUrl)) return false;
  if (lastFollowedUrl === targetUrl && msSinceLastFollow < 5000) return false;
  return true;
}
