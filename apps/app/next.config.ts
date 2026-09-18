import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Must be the monorepo root, not this app's own folder — pnpm hoists
    // dependencies to the root node_modules (see apps/web/next.config.ts
    // for the full story on why this matters on this machine).
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
