/**
 * Pure helpers for LMS assignment description HTML.
 * No DOM — regex only, so web and React Native share one copy.
 */

export interface IDescriptionLink {
  readonly text: string;
  readonly href: string;
}

const A_TAG_RE = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
const TAG_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;

export function extractDescriptionLinks(html: string): IDescriptionLink[] {
  const links: IDescriptionLink[] = [];
  let match: RegExpExecArray | null;
  A_TAG_RE.lastIndex = 0;
  while ((match = A_TAG_RE.exec(html)) !== null) {
    const href = match[1]?.trim() ?? '';
    const rawText = (match[2] ?? '').replace(TAG_RE, '').replace(WHITESPACE_RE, ' ').trim();
    const text = rawText !== '' ? rawText : href;
    if (href !== '' && !href.startsWith('javascript:')) {
      links.push({ href, text });
    }
  }
  return links;
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(TAG_RE, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
