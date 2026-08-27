import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to the monorepo. Next infers it by looking
    // for the nearest lockfile, and there's a stray package-lock.json in
    // the Windows home directory (C:\Users\suppo) that outranks this
    // repo's pnpm-workspace.yaml — so it was treating the whole home
    // folder as the project root. That widens file tracing well beyond
    // the repo and can pull the wrong dependency tree into the build.
    //
    // Must be the MONOREPO root (two levels up from apps/web), not this
    // app's own folder: pnpm hoists dependencies to the root
    // node_modules, so pinning it to apps/web leaves Next unable to
    // resolve its own package.
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
