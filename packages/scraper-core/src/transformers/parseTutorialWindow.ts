/**
 * Extract a tutorial window string from portal text (Skyward / Aeries).
 * Returns undefined when no tutorial line is present.
 */
export function parseTutorialWindow(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const text = raw.trim();
  const lower = text.toLowerCase();
  if (!lower.includes('tutorial')) {
    return undefined;
  }
  const lineMatch = text.match(/[^\n]*tutorial[^\n]*/i);
  const line = (lineMatch?.[0] ?? text).trim();
  const withoutLabel = line.replace(/^tutorial\s*[:\-]?\s*/i, '').trim();
  return withoutLabel.length > 0 ? withoutLabel : line;
}
