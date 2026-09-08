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

  // These two pages moved to the top level to match the links the API
  // actually emails: mail.service.ts builds `${APP_WEB_URL}/reset-password`
  // and `${APP_WEB_URL}/complete-registration`, so under /auth/ they 404'd.
  //
  // Redirects rather than deleting the old paths, because activation and
  // reset links live in people's inboxes — an email sent before the move
  // has to keep working.
  //
  // Next carries the query string across a redirect automatically when the
  // destination declares no query of its own, so `?token=...` survives.
  // That matters more than the redirect itself: a token-less landing is a
  // dead end.
  async redirects() {
    return [
      {
        source: "/auth/activate",
        destination: "/complete-registration",
        permanent: true,
      },
      {
        source: "/auth/reset-password",
        destination: "/reset-password",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
