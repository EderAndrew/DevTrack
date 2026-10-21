import { z } from "zod";
import { CodeHighlightSchema } from "../common/code-highlight.js";
import { UuidSchema } from "../common/primitives.js";
import { ExecutionKeySchema } from "../code-runs/enums.js";

// The programming-language catalog (010 research X17): data seeded by migration, read-only.

/** `GET /programming-languages`: active entries, ordered by name. */
export const ProgrammingLanguageViewSchema = z.strictObject({
  id: UuidSchema,
  /** Stable slug, e.g. `java`, `html-css`. */
  key: z.string(),
  name: z.string(),
  /** Grammar key of the code colors (014); null = plain text. */
  highlight: CodeHighlightSchema,
  /**
   * The Code Runner profile (019 research B5); null = the students can't run code in this language.
   * Whether a worker is live right now is not part of the catalog.
   */
  execution: ExecutionKeySchema.nullable(),
});
export type ProgrammingLanguageView = z.infer<typeof ProgrammingLanguageViewSchema>;

export const ProgrammingLanguageListSchema = z.array(ProgrammingLanguageViewSchema);
export type ProgrammingLanguageList = z.infer<typeof ProgrammingLanguageListSchema>;
