import type { MetadataRoute } from "next";
import { DISALLOWED_PATHS, SITE_ORIGIN } from "@/lib/seo/site";

/** robots.txt: only the public pages are crawled; the sitemap lists them. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...DISALLOWED_PATHS] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
