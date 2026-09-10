import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // Force dynamic (locale-dependent) pages to always be refetched on
    // client-side navigation instead of serving a stale cached RSC payload
    // from a previously-visited locale. Without this, navigating away from
    // a page and back can show content rendered in the wrong language.
    staleTimes: {
      dynamic: 0,
    },
  },
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

    // Required for react-pdf / pdfjs-dist to bundle correctly
    config.resolve.alias.canvas = false;

    return config;
  },
};

export default withNextIntl(nextConfig);
