/**
 * Same-origin topology (R6): the browser calls /api/* on this app and Next.js proxies it to
 * the API, so the session cookie is first-party and the API's Origin check sees this origin.
 */
const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
