import { sanitizeInstallToken } from '@scholaracle/contracts';

export interface IInstallLandingRenderer {
  render(params: { readonly tokenHex: string; readonly webOrigin: string }): string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function stripSlash(origin: string): string {
  return origin.replace(/\/+$/, '');
}

/**
 * Stateless landing HTML (SOURCE_INVITE.md §6). Does not look up the token.
 */
export class InstallLandingRenderer implements IInstallLandingRenderer {
  render(params: { readonly tokenHex: string; readonly webOrigin: string }): string {
    const token = sanitizeInstallToken(params.tokenHex);
    const qs = token ? `?t=${encodeURIComponent(token)}` : '';
    const appHref = escapeHtml(`scholarmancy://install-source${qs}`);
    const webHref = escapeHtml(`${stripSlash(params.webOrigin)}/dashboard/install-source${qs}`);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Install a school portal — Scholarmancy</title>
</head>
<body>
  <h1>Install a school portal in Scholarmancy</h1>
  <p>Open Scholarmancy, then tap the link again if needed.</p>
  <p><a href="${appHref}" data-testid="open-app">Open in Scholarmancy</a></p>
  <p><a href="${webHref}" data-testid="continue-browser">Continue in browser</a></p>
</body>
</html>`;
  }
}
