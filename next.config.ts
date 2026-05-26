import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "covers.openlibrary.org" },
      { protocol: "https", hostname: "books.google.com" },
    ],
  },
  webpack(config) {
    // Prevent the runtime-written `backups/` directory from triggering
    // hot-reload recompiles when backups are created or deleted.
    const prev = config.watchOptions?.ignored;
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
        "**/backups/**",
      ],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
