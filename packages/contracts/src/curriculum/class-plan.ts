import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { ClassMeetingViewSchema, PlanRevisionSchema } from "./class-meetings.js";
import { MAX_ITEMS_PER_TOPIC, MAX_TOPICS_PER_PLAN } from "./limits.js";

// Class plan and topics (004 contracts/http-api.md, "Planejamento e tópicos"). Every write
// carries the `planRevision` the client read and answers with the updated `ClassPlanView`.

export const ClassPlanStatusSchema = z.enum(["DRAFT", "READY", "ACTIVE", "ARCHIVED"]);
export type ClassPlanStatus = z.infer<typeof ClassPlanStatusSchema>;

/** `COMPLETED`: "Aula concluída" (004/US9). */
export const TopicStatusSchema = z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]);
export type TopicStatus = z.infer<typeof TopicStatusSchema>;

/** `GENERATED` is reserved for AI topic generation (next phase). */
export const TopicOriginSchema = z.enum(["MANUAL", "GENERATED"]);
export type TopicOrigin = z.infer<typeof TopicOriginSchema>;

const hasNoRepeats = (values: readonly string[]) => new Set(values).size === values.length;

export const TopicViewSchema = z.strictObject({
  id: UuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  position: z.int(),
  meetingId: UuidSchema.nullable(),
  origin: TopicOriginSchema,
  status: TopicStatusSchema,
  /** `outsideRevision`: linked item that is not in the revision the plan uses now (research E16). */
  items: z.array(z.strictObject({ id: UuidSchema, text: z.string(), outsideRevision: z.boolean() })),
  mergedIntoTopicId: UuidSchema.nullable(),
  splitFromTopicId: UuidSchema.nullable(),
  /** Date of the meeting the topic was completed in; kept once a completed topic is archived. */
  completedOn: IsoDateSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type TopicView = z.infer<typeof TopicViewSchema>;

export const ClassPlanViewSchema = z.strictObject({
  id: UuidSchema,
  classId: UuidSchema,
  status: ClassPlanStatusSchema,
  revision: PlanRevisionSchema,
  syllabus: z.strictObject({
    subjectId: UuidSchema,
    documentId: UuidSchema,
    documentVersion: z.int(),
    revisionId: UuidSchema,
    revisionNumber: z.int(),
  }),
  meetings: z.array(ClassMeetingViewSchema),
  /** Non-archived topics, by position. */
  topics: z.array(TopicViewSchema),
  archivedTopicCount: z.int(),
});
export type ClassPlanView = z.infer<typeof ClassPlanViewSchema>;

/** `plan: null` while the class has not selected a syllabus revision. */
export const ClassPlanEnvelopeSchema = z.strictObject({ plan: ClassPlanViewSchema.nullable() });
export type ClassPlanEnvelope = z.infer<typeof ClassPlanEnvelopeSchema>;

/** Creates the DRAFT plan when `planRevision` is null and the class has none. */
export const SelectPlanSyllabusRequestSchema = z.strictObject({
  planRevision: PlanRevisionSchema.nullable(),
  revisionId: UuidSchema,
});
export type SelectPlanSyllabusRequest = z.infer<typeof SelectPlanSyllabusRequestSchema>;

export const PlanStatusActionSchema = z.enum(["CONFIRM", "REOPEN", "START", "ARCHIVE"]);
export type PlanStatusAction = z.infer<typeof PlanStatusActionSchema>;

export const ChangePlanStatusRequestSchema = z.strictObject({
  planRevision: PlanRevisionSchema,
  action: PlanStatusActionSchema,
});
export type ChangePlanStatusRequest = z.infer<typeof ChangePlanStatusRequestSchema>;

const TopicFieldShape = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  /** A meeting of the same class; null → "Sem data". */
  meetingId: UuidSchema.nullable().optional(),
  /** Items of the revision the plan uses. */
  itemIds: z.array(UuidSchema).max(MAX_ITEMS_PER_TOPIC).refine(hasNoRepeats),
};

export const TopicFieldsSchema = z.strictObject(TopicFieldShape);
export type TopicFields = z.infer<typeof TopicFieldsSchema>;

export const CreateTopicRequestSchema = z.strictObject({ planRevision: PlanRevisionSchema, ...TopicFieldShape });
export type CreateTopicRequest = z.infer<typeof CreateTopicRequestSchema>;

/** `planRevision` plus at least one topic field. */
export const UpdateTopicRequestSchema = z
  .strictObject({ planRevision: PlanRevisionSchema, ...TopicFieldsSchema.partial().shape })
  .refine((value) => Object.entries(value).some(([key, field]) => key !== "planRevision" && field !== undefined));
export type UpdateTopicRequest = z.infer<typeof UpdateTopicRequestSchema>;

/** The first topic is the one that stays and receives the fields; repeated ids → 400. */
export const MergeTopicsRequestSchema = z.strictObject({
  planRevision: PlanRevisionSchema,
  topicIds: z.array(UuidSchema).min(2).max(20).refine(hasNoRepeats),
  ...TopicFieldShape,
});
export type MergeTopicsRequest = z.infer<typeof MergeTopicsRequestSchema>;

/** The first part stays in the original topic. */
export const SplitTopicRequestSchema = z.strictObject({
  planRevision: PlanRevisionSchema,
  parts: z.array(TopicFieldsSchema).min(2).max(10),
});
export type SplitTopicRequest = z.infer<typeof SplitTopicRequestSchema>;

/** Archive, restore, complete and reopen. */
export const TopicActionRequestSchema = z.strictObject({ planRevision: PlanRevisionSchema });
export type TopicActionRequest = z.infer<typeof TopicActionRequestSchema>;

/** Every non-archived topic exactly once, in the new order, with its meeting. */
export const ReorderTopicsRequestSchema = z.strictObject({
  planRevision: PlanRevisionSchema,
  items: z
    .array(z.strictObject({ topicId: UuidSchema, meetingId: UuidSchema.nullable() }))
    .max(MAX_TOPICS_PER_PLAN)
    .refine((items) => hasNoRepeats(items.map((item) => item.topicId))),
});
export type ReorderTopicsRequest = z.infer<typeof ReorderTopicsRequestSchema>;

export const TopicListQuerySchema = z.strictObject({ status: z.literal("ARCHIVED") });
export type TopicListQuery = z.infer<typeof TopicListQuerySchema>;

export const TopicListSchema = z.strictObject({ items: z.array(TopicViewSchema) });
export type TopicList = z.infer<typeof TopicListSchema>;

/** Which non-archived topics cover each item of the revision the plan uses. */
export const PlanCoverageSchema = z.strictObject({
  groups: z.array(
    z.strictObject({
      id: UuidSchema,
      title: z.string().nullable(),
      items: z.array(z.strictObject({ id: UuidSchema, text: z.string(), topicIds: z.array(UuidSchema) })),
    }),
  ),
  coveredCount: z.int(),
  totalCount: z.int(),
});
export type PlanCoverage = z.infer<typeof PlanCoverageSchema>;
