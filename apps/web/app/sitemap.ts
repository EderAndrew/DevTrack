import type { MetadataRoute } from "next";
import { INDEXABLE_PATHS, SITE_ORIGIN } from "@/lib/seo/site";

/** sitemap.xml: the indexable pages only. */
export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PATHS.map((path) => ({ url: `${SITE_ORIGIN}${path}`, changeFrequency: "monthly", priority: 1 }));
}
