/**
 * Same-origin topology (R6): the browser calls /api/* on this app and Next.js proxies it to
 * the API, so the session cookie is first-party and the API's Origin check sees this origin.
 */
const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Do not generate AGENTS.md/CLAUDE.md in this app: the repository keeps its own at the root.
  agentRules: false,
  async headers() {
    // Verification and activation links carry a token in the query string: never send it as Referer (R7).
    const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    return [
      { source: "/verificar-email", headers: noReferrer },
      { source: "/ativar-admin", headers: noReferrer },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
