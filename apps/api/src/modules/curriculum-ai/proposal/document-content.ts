import { UuidSchema } from "@repo/contracts";
import { z } from "zod";
import { MAX_BLOCK_TEXT, READER_VERSION } from "../../syllabus/extraction/normalize";

/** Blocks of one normalized document (007 data-model; the whole result is also capped at 200 KB by 006). */
export const MAX_DOCUMENT_BLOCKS = 5000;

/**
 * What `read-curriculum-document` returns (007 data-model, "Normalized document content"): computed
 * from the immutable original on each call, never stored. `build` reads it back from the tool
 * results, so both sides parse the same strict schema.
 */
export const CurriculumDocumentContentSchema = z.strictObject({
  documentId: UuidSchema,
  subjectName: z.string(),
  mediaType: z.enum(["PDF", "DOCX"]),
  readerVersion: z.literal(READER_VERSION),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  blocks: z
    .array(
      z.strictObject({
        ref: z.string().min(1).max(20),
        kind: z.enum(["heading", "group", "item", "text"]),
        text: z.string().min(1).max(MAX_BLOCK_TEXT),
      }),
    )
    .min(1)
    .max(MAX_DOCUMENT_BLOCKS),
});
export type CurriculumDocumentContent = z.infer<typeof CurriculumDocumentContentSchema>;
export type CurriculumDocumentBlock = CurriculumDocumentContent["blocks"][number];
