/** Page functions shared by every driver. Each runs in the page and is self-contained. */

/** The page's full HTML. */
export function getDocumentOuterHtml(): string {
  return document.documentElement.outerHTML;
}

/**
 * True while the page still shows a sign-in form: a visible password field in
 * the top document. Used so the phone never starts a sync on a login page, and
 * to tell "you were signed out" apart from other failures.
 */
export function isLoginFormShowing(): boolean {
  const fields = document.querySelectorAll('input[type="password"]');
  for (let i = 0; i < fields.length; i++) {
    const el = fields[i] as HTMLInputElement;
    if (el.disabled) continue;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    ) {
      return true;
    }
  }
  return false;
}
