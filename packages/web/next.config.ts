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
