import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.squarespace-cdn.com",
        pathname: "/content/v1/**",
      },
    ],
  },
  // F35 bulk layer import: one server action PER FILE, but a single 2 MB layer +
  // its multipart overhead can exceed the 1 MB default. 4 MB headroom; the client
  // still rejects files > 2 MB. Featured custom images (PM 23/9) accept files up
  // to ~4 MB, so the headroom doubles to 8 MB. Key verified against next 15.5 config-shared.d.ts.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default withNextIntl(nextConfig);
