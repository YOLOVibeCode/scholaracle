import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Readable stack traces in production error reports.
  productionBrowserSourceMaps: true,
};

export default nextConfig;
