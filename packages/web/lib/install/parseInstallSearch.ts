/**
 * SOURCE_INVITE.md §9 — parse ?t= from a search string.
 */

import { sanitizeInstallToken } from '@scholaracle/contracts';

export function parseInstallSearch(search: string): string | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const parts = raw.split('&');
  for (const part of parts) {
    const eq = part.indexOf('=');
    const key = (eq >= 0 ? part.slice(0, eq) : part).toLowerCase();
    if (key !== 't') continue;
    const value = eq >= 0 ? decodeURIComponent(part.slice(eq + 1)) : '';
    const token = sanitizeInstallToken(value);
    return token === '' ? null : token;
  }
  return null;
}
