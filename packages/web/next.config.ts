import type { NextConfig } from "next";

/**
 * Browser protections sent with every response. Guarded by lib/securityHeaders.test.ts.
 *
 * - HTTPS only, for this host, for a year. No `includeSubDomains` and no `preload`:
 *   both are hard to undo, and a subdomain that only answers on http would break.
 * - Only this site may frame its pages (clickjacking). `X-Frame-Options` is for old
 *   browsers; `frame-ancestors` is what current ones read.
 * - `base-uri` stops an injected <base> tag from redirecting relative links.
 * - The policy does not restrict scripts, styles, frames or plugins yet. That needs a
 *   nonce on every script Next.js writes and a pass through every page in a browser.
 */
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Readable stack traces in production error reports.
  productionBrowserSourceMaps: true,
  // Do not send `X-Powered-By: Next.js`.
  poweredByHeader: false,
  transpilePackages: ['@scholaracle/studio-core', '@scholaracle/contracts', '@scholaracle/interfaces'],
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        // iOS universal links: Apple requires application/json, no redirect,
        // and no file extension. public/.well-known/apple-app-site-association.
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      {
        // Android app links: public/.well-known/assetlinks.json. The fingerprint is the
        // certificate Google Play signs the release with (Play app signing), read from the
        // Play Developer API (generatedApks.certificateSha256Hash). It is public. It changes
        // only if the Play signing key is rotated; then update the file and its test.
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
  },
};

export default nextConfig;
