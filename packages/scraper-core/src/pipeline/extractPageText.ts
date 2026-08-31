/** Size cap from CLASS_OFFLINE_PACK §3 — grab-enough HTML, not a full archive. */
export const EXTRACTED_TEXT_MAX_CHARS = 50_000;

/**
 * Strip markup to readable text. Used when the host has raw HTML (tests, CLI)
 * rather than a live DOM. WebView prefers `document.body.innerText`.
 */
export function extractPageText(html: string, maxChars: number = EXTRACTED_TEXT_MAX_CHARS): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const withoutNoise = withoutComments.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ');
  const withoutTags = withoutNoise.replace(/<[^>]+>/g, ' ');
  const decoded = withoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  const collapsed = decoded.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, maxChars);
}
