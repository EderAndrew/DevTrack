import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import {
  MAX_GROUP_TITLE_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_ITEMS_PER_REVISION,
  MAX_REVISION_TEXT_LENGTH,
  MAX_REVISION_TITLE_LENGTH,
} from "./limits.js";

// Syllabus documents and their reviewed content (004 contracts/http-api.md, "Ementa").

export const SyllabusMediaTypeSchema = z.enum(["PDF", "DOCX", "PNG", "JPEG"]);
export type SyllabusMediaType = z.infer<typeof SyllabusMediaTypeSchema>;

export const SyllabusProcessingStatusSchema = z.enum(["UPLOADED", "PROCESSING", "PROCESSED", "FAILED"]);
export type SyllabusProcessingStatus = z.infer<typeof SyllabusProcessingStatusSchema>;

export const SyllabusFailureCategorySchema = z.enum(["UNREADABLE", "TIMEOUT", "INTERNAL"]);
export type SyllabusFailureCategory = z.infer<typeof SyllabusFailureCategorySchema>;

/** `NO_TEXT`: nothing to extract (scanned PDF or image, no OCR — 004/FR-020). */
export const SyllabusExtractionResultSchema = z.enum(["TEXT", "NO_TEXT"]);
export type SyllabusExtractionResult = z.infer<typeof SyllabusExtractionResultSchema>;

export const SyllabusRevisionStatusSchema = z.enum(["DRAFT", "CONFIRMED"]);
export type SyllabusRevisionStatus = z.infer<typeof SyllabusRevisionStatusSchema>;

/**
 * Where a draft starts from: the extraction, an empty form, a copy of a confirmed revision, or an
 * applied Curriculum Agent proposal (`AI_ASSISTED`, 007; only the apply route creates it).
 */
export const SyllabusRevisionSourceSchema = z.enum(["EXTRACTION", "MANUAL", "REVISION", "AI_ASSISTED"]);
export type SyllabusRevisionSource = z.infer<typeof SyllabusRevisionSourceSchema>;

/** Never exposes the storage key nor the hash. */
export const SyllabusDocumentViewSchema = z.strictObject({
  id: UuidSchema,
  subjectId: UuidSchema,
  version: z.int(),
  originalFilename: z.string(),
  mediaType: SyllabusMediaTypeSchema,
  sizeBytes: z.int(),
  pageCount: z.int().nullable(),
  processingStatus: SyllabusProcessingStatusSchema,
  failureCategory: SyllabusFailureCategorySchema.nullable(),
  extractionResult: SyllabusExtractionResultSchema.nullable(),
  attempts: z.int(),
  uploadedAt: IsoDateTimeSchema,
  processedAt: IsoDateTimeSchema.nullable(),
  /** `source` labels the versions list ("Preenchido com IA", 007). */
  confirmedRevision: z.strictObject({ id: UuidSchema, number: z.int(), source: SyllabusRevisionSourceSchema }).nullable(),
  draftRevisionId: UuidSchema.nullable(),
});
export type SyllabusDocumentView = z.infer<typeof SyllabusDocumentViewSchema>;

/** `GET /subjects/:id/syllabus-documents`, newest version first. */
export const SyllabusDocumentListSchema = z.strictObject({ items: z.array(SyllabusDocumentViewSchema) });
export type SyllabusDocumentList = z.infer<typeof SyllabusDocumentListSchema>;

/** `duplicate: true` → the same file was already uploaded; `document` is that existing version. */
export const SyllabusUploadResultSchema = z.strictObject({
  document: SyllabusDocumentViewSchema,
  duplicate: z.boolean(),
});
export type SyllabusUploadResult = z.infer<typeof SyllabusUploadResultSchema>;

/** What extractor version 1 read from the document (research E10). Kept as extracted, never edited. */
export const SyllabusExtractionSchema = z.strictObject({
  extractorVersion: z.literal(1),
  title: z.string().nullable(),
  syllabusText: z.string().nullable(),
  competencyText: z.string().nullable(),
  groups: z.array(z.strictObject({ title: z.string().nullable(), items: z.array(z.string()) })),
});
export type SyllabusExtraction = z.infer<typeof SyllabusExtractionSchema>;

export const SyllabusDocumentDetailSchema = SyllabusDocumentViewSchema.extend({
  extraction: SyllabusExtractionSchema.nullable(),
  revisions: z.array(
    z.strictObject({
      id: UuidSchema,
      number: z.int(),
      status: SyllabusRevisionStatusSchema,
      source: SyllabusRevisionSourceSchema,
      aiProposalId: UuidSchema.nullable(),
      confirmedAt: IsoDateTimeSchema.nullable(),
    }),
  ),
});
export type SyllabusDocumentDetail = z.infer<typeof SyllabusDocumentDetailSchema>;

/** `GET /syllabus-documents/:id/file`: `inline` only for PNG and JPEG (research E18). */
export const SyllabusFileQuerySchema = z.strictObject({ view: z.literal("inline").optional() });
export type SyllabusFileQuery = z.infer<typeof SyllabusFileQuerySchema>;

/**
 * `basedOnRevisionId` is required if, and only if, `source` is `REVISION`. `AI_ASSISTED` is
 * refused: only applying a proposal creates it (007 data-model).
 */
export const CreateSyllabusRevisionRequestSchema = z
  .strictObject({
    source: SyllabusRevisionSourceSchema.exclude(["AI_ASSISTED"]),
    basedOnRevisionId: UuidSchema.optional(),
  })
  .refine((value) => (value.source === "REVISION") === (value.basedOnRevisionId !== undefined), {
    path: ["basedOnRevisionId"],
  });
export type CreateSyllabusRevisionRequest = z.infer<typeof CreateSyllabusRevisionRequestSchema>;

export const SyllabusRevisionViewSchema = z.strictObject({
  id: UuidSchema,
  documentId: UuidSchema,
  number: z.int(),
  status: SyllabusRevisionStatusSchema,
  source: SyllabusRevisionSourceSchema,
  /** The applied proposal of an `AI_ASSISTED` revision (007); null otherwise. */
  aiProposalId: UuidSchema.nullable(),
  title: z.string().nullable(),
  syllabusText: z.string().nullable(),
  competencyText: z.string().nullable(),
  groups: z.array(
    z.strictObject({
      id: UuidSchema,
      position: z.int(),
      title: z.string().nullable(),
      items: z.array(z.strictObject({ id: UuidSchema, position: z.int(), text: z.string() })),
    }),
  ),
  itemCount: z.int(),
  confirmedAt: IsoDateTimeSchema.nullable(),
});
export type SyllabusRevisionView = z.infer<typeof SyllabusRevisionViewSchema>;

/**
 * The whole draft content; positions come from the array order. An item may carry the `id` it has
 * in this draft, so an item copied from a confirmed revision keeps its origin (research E16).
 */
export const SaveSyllabusRevisionRequestSchema = z
  .strictObject({
    title: z.string().trim().max(MAX_REVISION_TITLE_LENGTH).nullable().optional(),
    syllabusText: z.string().trim().max(MAX_REVISION_TEXT_LENGTH).nullable().optional(),
    competencyText: z.string().trim().max(MAX_REVISION_TEXT_LENGTH).nullable().optional(),
    groups: z
      .array(
        z.strictObject({
          title: z.string().trim().max(MAX_GROUP_TITLE_LENGTH).nullable().optional(),
          items: z
            .array(z.strictObject({ id: UuidSchema.optional(), text: z.string().trim().min(1).max(MAX_ITEM_TEXT_LENGTH) }))
            .max(MAX_ITEMS_PER_REVISION),
        }),
      )
      .max(MAX_ITEMS_PER_REVISION),
  })
  .refine((value) => value.groups.reduce((sum, group) => sum + group.items.length, 0) <= MAX_ITEMS_PER_REVISION, {
    path: ["groups"],
  })
  .refine(
    (value) => {
      const ids = value.groups.flatMap((group) => group.items.flatMap((item) => (item.id ? [item.id] : [])));
      return new Set(ids).size === ids.length;
    },
    { path: ["groups"] },
  );
export type SaveSyllabusRevisionRequest = z.infer<typeof SaveSyllabusRevisionRequestSchema>;
