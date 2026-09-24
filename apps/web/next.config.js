import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Same-origin topology (R6): the browser calls /api/* on this app and Next.js proxies it to
 * the API, so the session cookie is first-party and the API's Origin check sees this origin.
 * The rewrite target is read at build time; server components read API_ORIGIN at runtime.
 */
const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");

/**
 * Version shown on the login screen, fixed at build time (at startup in `next dev`): the
 * major.minor of package.json, the number of commits as patch and the short commit hash, e.g.
 * `0.1.42 (b3924e0)`. Every new commit on main changes it. APP_VERSION overrides it; without git
 * (a build from a tarball) it falls back to package.json.
 */
function appVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const [major, minor] = version.split(".");
    return `${major}.${minor}.${git("rev-list", "--count", "HEAD")} (${git("rev-parse", "--short", "HEAD")})`;
  } catch {
    return version;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The E2E suite builds into its own directory (e2e/playwright.config.ts): the rewrite below is
  // fixed at build time, and its build must not replace the one of `pnpm build`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: appVersion() },
  // Do not generate AGENTS.md/CLAUDE.md in this app: the repository keeps its own at the root.
  agentRules: false,
  async headers() {
    // Verification and activation links carry a token in the query string: never send it as Referer (R7).
    const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    return [
      { source: "/verificar-email", headers: noReferrer },
      { source: "/ativar-admin", headers: noReferrer },
      { source: "/convite", headers: noReferrer },
      { source: "/convite-turma", headers: noReferrer },
      // The way back to a class invitation carries its token in `?next=` (003 US4).
      { source: "/entrar", headers: noReferrer },
      { source: "/redefinir-senha", headers: noReferrer },
    ];
  },
  experimental: {
    // Syllabus uploads go through the rewrite (004 research E5): its default body limit (10 MiB)
    // would cut a 10 MB file plus the multipart envelope. The API still enforces 10 MB (413).
    proxyClientMaxBodySize: "11mb",
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
