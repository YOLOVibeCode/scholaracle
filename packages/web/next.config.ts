import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Readable stack traces in production error reports.
  productionBrowserSourceMaps: true,
  transpilePackages: ['@scholaracle/studio-core', '@scholaracle/contracts', '@scholaracle/interfaces'],
  async headers() {
    return [
      {
        // iOS universal links: Apple requires application/json, no redirect,
        // and no file extension. public/.well-known/apple-app-site-association.
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      // TODO(android app links): public/.well-known/assetlinks.json is NOT
      // published yet. It needs the SHA-256 certificate fingerprint of the key
      // Google Play signs the release with (Play Console > Test and release >
      // App integrity > App signing key certificate). Until then the Android
      // intent filter (autoVerify) simply fails verification and /magic links
      // keep opening in the browser, which falls back to the scholarmancy://
      // redirect on the /magic page. Do not publish a placeholder fingerprint.
    ];
  },
};

export default nextConfig;
