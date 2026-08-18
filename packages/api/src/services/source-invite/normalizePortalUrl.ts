/**
 * SOURCE_INVITE.md §5.2 — https portal URL normalize (Node URL API is OK here).
 */

import { ValidationError } from '@scholaracle/contracts';

export function normalizePortalUrl(input: string): string {
  const trimmed = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError('Enter a full portal address like https://school.example.com');
  }
  if (parsed.protocol !== 'https:') {
    throw new ValidationError('Portal URL must use https');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new ValidationError('Portal URL must not include credentials');
  }
  if (parsed.hostname === '') {
    throw new ValidationError('Enter a full portal address like https://school.example.com');
  }
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';
  let href = parsed.href;
  while (href.endsWith('/')) href = href.slice(0, -1);
  return href;
}

export function institutionExternalIdFromPortalUrl(portalBaseUrl: string): string {
  return new URL(portalBaseUrl).hostname.toLowerCase();
}
