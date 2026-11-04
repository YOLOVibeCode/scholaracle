/** Page functions shared by every driver. Each runs in the page and is self-contained. */

/** The page's full HTML. */
export function getDocumentOuterHtml(): string {
  return document.documentElement.outerHTML;
}
