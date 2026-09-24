"use client";

import type { TopicView } from "@repo/contracts";
import { TopicFormDialog, type TopicFormDialogProps } from "./topic-form-dialog";

export interface MergeTopicsDialogProps extends Omit<TopicFormDialogProps, "initial" | "topic" | "mergeTopics"> {
  /** The selected topics in plan order: the first one stays. */
  topics: readonly TopicView[];
}

/**
 * "Juntar tópicos" (004/US6-2, FR-036): the topic form with the title, description and class day
 * of the first topic and the union of their items, all reviewed before confirming.
 */
export function MergeTopicsDialog({ topics, ...props }: MergeTopicsDialogProps) {
  return <TopicFormDialog {...props} mergeTopics={topics} />;
}
