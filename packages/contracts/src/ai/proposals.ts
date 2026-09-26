import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { AiProposalStatusSchema } from "./enums.js";
import { AiAgentRefSchema } from "./executions.js";

// Proposals of L2 agents for the teacher's review (006 contracts/http-api.md). A proposal is a
// SUGGESTION; the teacher's decision is a HUMAN_DECISION (constitution XI). Deciding never
// changes the domain (006/FR-044).

const AiProposalFieldsSchema = z.strictObject({
  id: UuidSchema,
  executionId: UuidSchema,
  agent: AiAgentRefSchema,
  proposalType: z.string(),
  target: z.strictObject({ type: z.string(), id: UuidSchema.nullable() }),
  status: AiProposalStatusSchema,
  nature: z.literal("SUGGESTION"),
  itemIds: z.array(z.string()),
  acceptedItemIds: z.array(z.string()).nullable(),
  expiresAt: IsoDateTimeSchema,
  decidedAt: IsoDateTimeSchema.nullable(),
  decision: z.strictObject({ nature: z.literal("HUMAN_DECISION"), byUserId: UuidSchema }).nullable(),
  createdAt: IsoDateTimeSchema,
});

/** With the proposed content, validated by the agent's output schema. */
export const AiProposalViewSchema = AiProposalFieldsSchema.extend({ content: z.unknown() });
export type AiProposalView = z.infer<typeof AiProposalViewSchema>;

/** List item: without the content. */
export const AiProposalSummarySchema = AiProposalFieldsSchema;
export type AiProposalSummary = z.infer<typeof AiProposalSummarySchema>;

export const AiProposalListQuerySchema = z.strictObject({
  status: AiProposalStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
});
export type AiProposalListQuery = z.infer<typeof AiProposalListQuerySchema>;

export const AiProposalPageSchema = z.strictObject({
  items: z.array(AiProposalSummarySchema),
  nextCursor: z.string().nullable(),
});
export type AiProposalPage = z.infer<typeof AiProposalPageSchema>;

export const AiProposalDecisionSchema = z.enum(["APPROVE", "APPROVE_PARTIALLY", "REJECT"]);
export type AiProposalDecision = z.infer<typeof AiProposalDecisionSchema>;

/** `acceptedItemIds` iff `APPROVE_PARTIALLY`: 1–500 distinct item ids (006/FR-043). */
export const DecideAiProposalRequestSchema = z
  .strictObject({
    decision: AiProposalDecisionSchema,
    acceptedItemIds: z.array(z.string().min(1).max(200)).min(1).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    const partial = value.decision === "APPROVE_PARTIALLY";
    if (partial !== (value.acceptedItemIds !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["acceptedItemIds"] });
    }
    if (value.acceptedItemIds && new Set(value.acceptedItemIds).size !== value.acceptedItemIds.length) {
      ctx.addIssue({ code: "custom", path: ["acceptedItemIds"] });
    }
  });
export type DecideAiProposalRequest = z.infer<typeof DecideAiProposalRequestSchema>;
