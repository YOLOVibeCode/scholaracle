/**
 * Resolve the backend API base URL used by the web client (includes /api suffix).
 * Deploy E2E sets API_BASE_URL; local Playwright may set NEXT_PUBLIC_API_URL.
 */
export function resolveBackendApiBase(): string {
  const fromPublic = process.env['NEXT_PUBLIC_API_URL'];
  if (fromPublic !== undefined && fromPublic !== '') {
    return fromPublic.replace(/\/$/, '');
  }
  const root = (process.env['API_BASE_URL'] ?? 'http://localhost:2801').replace(/\/$/, '');
  return `${root}/api`;
}

/** Playwright route glob scoped to the product API host — not the Next.js /api routes on the web origin. */
export function backendApiRoutePattern(): string {
  const origin = new URL(resolveBackendApiBase()).origin;
  return `${origin}/api/**`;
}
