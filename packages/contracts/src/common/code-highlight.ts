import { z } from "zod";

/**
 * The grammar key a catalog language uses to color its code (014 research L3, L8):
 * `programming_languages.highlight`, e.g. `java`, `typescript`; `null` = no highlighting. Shared by
 * the exercise, work and activity shapes, which may not import each other.
 */
export const CodeHighlightSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}$/)
  .nullable();
export type CodeHighlight = z.infer<typeof CodeHighlightSchema>;
