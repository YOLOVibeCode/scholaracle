/**
 * Base URL for SIGNED ASSET LINKS — must be the API's own origin, never the
 * web app's. `config.baseUrl` is the web origin (invite/reset links) and in
 * production stored asset URLs are absolute on the API host, so signing
 * against the web origin produces zero matches and wrong-host links.
 * Railway injects RAILWAY_PUBLIC_DOMAIN per environment, so this needs no
 * per-env configuration; API_BASE_URL is an explicit override.
 */
export function resolveApiBaseUrl(configBaseUrl: string | undefined): string {
  const explicit = process.env['API_BASE_URL'];
  if (explicit) return explicit;
  const railwayDomain = process.env['RAILWAY_PUBLIC_DOMAIN'];
  if (railwayDomain) return `https://${railwayDomain}`;
  const assetBase = process.env['ASSET_BASE_URL'];
  if (assetBase) return assetBase;
  const port = process.env['PORT'];
  const webLocal =
    configBaseUrl === undefined ||
    configBaseUrl.includes('localhost:2800') ||
    configBaseUrl.includes('127.0.0.1:2800');
  if (webLocal && port !== undefined && port !== '' && port !== '2800') {
    return `http://localhost:${port}`;
  }
  return configBaseUrl ?? '';
}
