import { z } from "zod";
import { UuidSchema } from "../common/primitives.js";
import { AiExecutionViewSchema } from "../ai/executions.js";
import { AiProposalViewSchema } from "../ai/proposals.js";
import {
  MAX_GROUP_TITLE_LENGTH,
  MAX_ITEM_TEXT_LENGTH,
  MAX_ITEMS_PER_REVISION,
  MAX_REVISION_TEXT_LENGTH,
  MAX_REVISION_TITLE_LENGTH,
} from "./limits.js";
import { SyllabusRevisionViewSchema } from "./syllabus.js";

// Curriculum Agent (007 contracts/http-api.md and data-model.md): "Preencher com IA" on a syllabus
// document. The agent proposes; applying the proposal creates a 004 draft.

/** Groups the agent may propose; a group's index is its item id (`group:<i>`). */
export const MAX_CURRICULUM_GROUPS = 200;
/** Items in one proposed group. */
export const MAX_CURRICULUM_GROUP_ITEMS = 200;
/** Warnings in one agent output. */
export const MAX_CURRICULUM_WARNINGS = 50;

/** What the model may report; there is no free-text message (007/FR-004). */
export const CurriculumWarningCodeSchema = z.enum([
  "FIELD_NOT_FOUND",
  "AMBIGUOUS_STRUCTURE",
  "LOW_DOCUMENT_QUALITY",
  "INCOMPLETE_SECTION",
  "UNREADABLE_CONTENT",
  "POSSIBLE_DUPLICATE_CONTENT",
]);
export type CurriculumWarningCode = z.infer<typeof CurriculumWarningCodeSchema>;

/** The review screen adds the grounding check's own warning, never produced by the model (007/FR-021). */
export const CurriculumReviewWarningCodeSchema = z.enum([
  ...CurriculumWarningCodeSchema.options,
  "UNSUPPORTED_CONTENT",
]);
export type CurriculumReviewWarningCode = z.infer<
  typeof CurriculumReviewWarningCodeSchema
>;

/** A block of the normalized document: `p<page>.<line>` (PDF) or `par<n>` (DOCX), research C9. */
export const CurriculumSourceRefSchema = z
  .string()
  .max(20)
  .regex(/^p\d+\.\d+$|^par\d+$/);
export type CurriculumSourceRef = z.infer<typeof CurriculumSourceRefSchema>;

/** A programming language as the catalog names it (010 research X17, X18). */
export const CurriculumLanguageSchema = z.strictObject({
  key: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
});
export type CurriculumLanguage = z.infer<typeof CurriculumLanguageSchema>;

const extractionFields = {
  title: z.string().min(1).max(MAX_REVISION_TITLE_LENGTH).nullable(),
  syllabusText: z.string().min(1).max(MAX_REVISION_TEXT_LENGTH).nullable(),
  competencyText: z.string().min(1).max(MAX_REVISION_TEXT_LENGTH).nullable(),
  groups: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(MAX_GROUP_TITLE_LENGTH).nullable(),
        items: z
          .array(
            z.strictObject({
              text: z.string().min(1).max(MAX_ITEM_TEXT_LENGTH),
              sourceRef: z.string().min(1).max(20).nullable(),
            }),
          )
          .min(1)
          .max(MAX_CURRICULUM_GROUP_ITEMS),
      }),
    )
    .max(MAX_CURRICULUM_GROUPS),
  warnings: z
    .array(
      z.strictObject({
        code: CurriculumWarningCodeSchema,
        field: z
          .enum(["title", "syllabusText", "competencyText", "groups"])
          .nullable(),
        groupIndex: z
          .int()
          .min(0)
          .max(MAX_CURRICULUM_GROUPS - 1)
          .nullable(),
      }),
    )
    .max(MAX_CURRICULUM_WARNINGS),
};

const withinItemLimit = (
  value: { groups: { items: unknown[] }[] },
  ctx: z.RefinementCtx,
) => {
  if (
    value.groups.reduce((sum, group) => sum + group.items.length, 0) >
    MAX_ITEMS_PER_REVISION
  ) {
    ctx.addIssue({ code: "custom", path: ["groups"] });
  }
};

/**
 * Output schema v1 of `curriculum-agent` (research C5). Every field is present, `null` when the
 * document does not have it. The text limits are the 004 draft's, so an accepted output always
 * fits a draft; the domain still revalidates when applying. Also the shape of the proposal's
 * `extraction`, whatever the output version.
 */
export const CurriculumExtractionOutputSchema = z
  .strictObject(extractionFields)
  .superRefine(withinItemLimit);
export type CurriculumExtractionOutput = z.infer<
  typeof CurriculumExtractionOutputSchema
>;

/**
 * Output schema v2 (010 research X18): v1 and `languageKey`, the key of the language the document
 * describes, chosen only from the catalog the read tool returns, or null.
 */
export const CurriculumExtractionOutputV2Schema = z
  .strictObject({
    ...extractionFields,
    languageKey: z.string().min(1).max(40).nullable(),
  })
  .superRefine(withinItemLimit);
export type CurriculumExtractionOutputV2 = z.infer<
  typeof CurriculumExtractionOutputV2Schema
>;

/** A proposal item the teacher accepts or not: one of the three fields, the language (010), or a whole group. */
export const CurriculumItemIdSchema = z.union([
  z.enum(["title", "syllabusText", "competencyText", "language"]),
  z.string().regex(/^group:(0|[1-9]\d?|1\d\d)$/),
]);
export type CurriculumItemId = z.infer<typeof CurriculumItemIdSchema>;

/** Text the deterministic grounding check found no support for in the document (research C8). */
export const CurriculumUnsupportedSchema = z.strictObject({
  field: z.enum([
    "title",
    "syllabusText",
    "competencyText",
    "language",
    "groupTitle",
    "item",
  ]),
  groupIndex: z.int().min(0).nullable(),
  itemIndex: z.int().min(0).nullable(),
});
export type CurriculumUnsupported = z.infer<typeof CurriculumUnsupportedSchema>;

/** The immutable payload of a `CURRICULUM_EXTRACTION` proposal (data-model, "Proposal content"). */
export const CurriculumProposalContentSchema = z.strictObject({
  extraction: CurriculumExtractionOutputSchema,
  /**
   * The language proposed (010/FR-041): a catalog entry, never a free value; null when the
   * document describes none, or one outside the catalog. Proposals made before 010 have none.
   */
  language: CurriculumLanguageSchema.nullable().default(null),
  grounding: z.strictObject({
    unsupported: z.array(CurriculumUnsupportedSchema),
  }),
  source: z.strictObject({
    documentId: UuidSchema,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    readerVersion: z.literal(1),
  }),
});
export type CurriculumProposalContent = z.infer<
  typeof CurriculumProposalContentSchema
>;

/** Why "Preencher com IA" can't be used now, checked in this order (research C14). */
export const CurriculumAiAvailabilitySchema = z.enum([
  "AVAILABLE",
  "DOCUMENT_NOT_READY",
  "DOCUMENT_WITHOUT_TEXT",
  "AGENT_DISABLED",
  "MODEL_UNAVAILABLE",
  "PAUSED",
]);
export type CurriculumAiAvailability = z.infer<
  typeof CurriculumAiAvailabilitySchema
>;

/** `GET /syllabus-documents/:id/ai`: drives the button, the progress and the resume after a reload. */
export const CurriculumAiStatusSchema = z.strictObject({
  availability: CurriculumAiAvailabilitySchema,
  activeExecution: AiExecutionViewSchema.nullable(),
  lastExecution: AiExecutionViewSchema.nullable(),
  /** Of `lastExecution` when it is `COMPLETED`: with a proposal, or nothing identified (007/FR-017). */
  lastOutcome: z.enum(["PROPOSAL", "NOTHING_FOUND"]).nullable(),
  pendingProposalId: UuidSchema.nullable(),
});
export type CurriculumAiStatus = z.infer<typeof CurriculumAiStatusSchema>;

/** `POST /syllabus-documents/:id/ai-analyses`. The agent, workspace and tools come from the server. */
export const RequestCurriculumAnalysisRequestSchema = z.strictObject({
  /** Rejects the pending proposal before asking again (FR-038); default false. */
  discardPendingProposal: z.boolean().optional(),
});
export type RequestCurriculumAnalysisRequest = z.infer<
  typeof RequestCurriculumAnalysisRequestSchema
>;

/** `created: false` → an active execution already existed (202 vs 200, research C13). */
export const RequestCurriculumAnalysisResponseSchema = z.strictObject({
  execution: AiExecutionViewSchema,
  created: z.boolean(),
});
export type RequestCurriculumAnalysisResponse = z.infer<
  typeof RequestCurriculumAnalysisResponseSchema
>;

/** `POST /syllabus-documents/:id/ai-proposals/:proposalId/apply`. */
export const ApplyCurriculumProposalRequestSchema = z.strictObject({
  acceptedItemIds: z
    .array(CurriculumItemIdSchema)
    .min(1)
    .max(4 + MAX_CURRICULUM_GROUPS)
    .refine((ids) => new Set(ids).size === ids.length),
  /** Explicit confirmation to rewrite an existing draft (FR-032). */
  replaceDraft: z.boolean(),
});
export type ApplyCurriculumProposalRequest = z.infer<
  typeof ApplyCurriculumProposalRequestSchema
>;

/** The draft created (or rewritten) and the proposal, now approved. */
export const ApplyCurriculumProposalResponseSchema = z.strictObject({
  revision: SyllabusRevisionViewSchema,
  proposal: AiProposalViewSchema,
});
export type ApplyCurriculumProposalResponse = z.infer<
  typeof ApplyCurriculumProposalResponseSchema
>;
