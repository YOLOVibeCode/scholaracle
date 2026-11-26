/**
 * Whether the home page can offer the one-click demo.
 *
 * The demo loads a sample household through the API's seed routes
 * (POST /api/seed/demo) and then signs in as the demo parent. The seed routes
 * are open on a developer machine only. A deployed API wants a seed token, and
 * the live API also keeps the demo sign-in private (DEMO_ACCOUNT_PASSWORD). So
 * the live site cannot load the demo and must not offer it: on 25 Nov 2026 its
 * three "Try the demo" buttons answered "Seed routes are not available on this
 * server".
 *
 * A seed token in a web build is public (NEXT_PUBLIC_SEED_TOKEN). Never set it
 * on production.
 */
export function isOneClickDemoAvailable(hostname: string, seedToken: string | undefined): boolean {
  if (seedToken !== undefined && seedToken.length > 0) return true;
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
}
