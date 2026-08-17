/**
 * SOURCE_INVITE.md §8.1 — parse scholarmancy://install-source?t=
 *
 * Plain string operations, NOT the URL API. React Native's URL polyfill only
 * understands http(s). See demoLogin.ts.
 */

import { sanitizeInstallToken } from '@scholaracle/contracts';
import type { IInstallSourceLinkParser } from './types';

const SCHEME_PREFIX = 'scholarmancy:';
const INSTALL_PATH = 'install-source';

function installSourceTarget(
  url: string
): { readonly path: string; readonly query: string } | null {
  const normalized = url.trim();
  const lower = normalized.toLowerCase();
  if (!lower.startsWith(SCHEME_PREFIX)) return null;
  const afterScheme = normalized.slice(SCHEME_PREFIX.length).replace(/^\/+/, '');
  const qIdx = afterScheme.indexOf('?');
  const hashIdx = afterScheme.indexOf('#');
  let pathAndQuery = afterScheme;
  if (hashIdx >= 0) pathAndQuery = afterScheme.slice(0, hashIdx);
  const path = (qIdx >= 0 ? pathAndQuery.slice(0, qIdx) : pathAndQuery)
    .replace(/\/+$/, '')
    .toLowerCase();
  const query = qIdx >= 0 ? pathAndQuery.slice(qIdx + 1) : '';
  return { path, query };
}

function queryValue(query: string, key: string): string | null {
  const parts = query.split('&');
  for (const part of parts) {
    const eq = part.indexOf('=');
    const k = (eq >= 0 ? part.slice(0, eq) : part).toLowerCase();
    if (k === key) return eq >= 0 ? part.slice(eq + 1) : '';
  }
  return null;
}

export const installSourceLinkParser: IInstallSourceLinkParser = {
  isInstallSourceDeepLink(url: string | null | undefined): boolean {
    if (!url) return false;
    const parsed = installSourceTarget(url);
    return parsed?.path === INSTALL_PATH;
  },

  parseInstallSourceToken(url: string | null | undefined): string | null {
    if (!url) return null;
    const parsed = installSourceTarget(url);
    if (!parsed || parsed.path !== INSTALL_PATH) return null;
    const raw = queryValue(parsed.query, 't');
    if (raw === null) return null;
    const token = sanitizeInstallToken(decodeURIComponent(raw));
    return token === '' ? null : token;
  },
};

export const isInstallSourceDeepLink =
  installSourceLinkParser.isInstallSourceDeepLink.bind(installSourceLinkParser);
export const parseInstallSourceToken =
  installSourceLinkParser.parseInstallSourceToken.bind(installSourceLinkParser);
