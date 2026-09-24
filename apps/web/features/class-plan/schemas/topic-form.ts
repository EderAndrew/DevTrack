import { type TopicFields, TopicFieldsSchema, UuidSchema } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

/** "Sem data": the value of the Aula select for a topic without a meeting. */
export const NO_MEETING = "";

/**
 * Topic form (004 contracts/web-ui.md), derived from `TopicFieldsSchema`: a blank description is
 * sent as null, and "Sem data" as a null meeting.
 */
export const TopicFormSchema = TopicFieldsSchema.extend({
  description: z.string().trim().max(5000),
  meetingId: z.union([z.literal(NO_MEETING), UuidSchema]),
});
export type TopicFormInput = z.input<typeof TopicFormSchema>;
export type TopicFormOutput = z.output<typeof TopicFormSchema>;

export const topicFormMessages = fieldMessages({ title: "Informe o título do tópico." });

export const toTopicFields = (values: TopicFormOutput): TopicFields => ({
  title: values.title,
  description: values.description || null,
  meetingId: values.meetingId || null,
  itemIds: values.itemIds,
});

/** API answers about the chosen items, shown next to them. */
export const ITEM_ERROR_CODES: readonly string[] = ["SYLLABUS_ITEM_NOT_IN_PLAN"];
