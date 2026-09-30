/**
 * Audit catalogue of contracts/audit-events.md (specs 001, 003, 004, 006, 007, 010 and 011): event type → metadata keys
 * allowed. Anything outside this list is a programming error (FR-071: no secrets in the trail).
 * `via` of `role.granted`/`account.claimed` is a `GrantSource`: INVITATION, ADMIN_BOOTSTRAP or,
 * since 003, CLASS_INVITATION.
 */
export const AUDIT_EVENT_METADATA = {
  "admin.bootstrap.requested": ["email", "mode", "operatorHost", "operatorUser"],
  "admin.bootstrap.link_printed": ["operatorHost", "operatorUser"],
  "admin.bootstrap.cancelled": ["reason"],
  "admin.bootstrap.refused": ["reason", "operatorHost", "operatorUser"],
  "admin.bootstrap.completed": ["bootstrapId", "mode"],
  "invitation.created": ["role", "email"],
  "invitation.resent": ["sendCount"],
  "invitation.revoked": [],
  "invitation.accepted": ["role", "userId", "mode"],
  "invitation.acceptance_refused": ["reason"],
  "invitation.self_invite_blocked": ["role"],
  "role.granted": ["userId", "role", "via"],
  "role.status_changed": ["userId", "role", "from", "to"],
  "account.suspended": [],
  "account.reactivated": [],
  "account.claimed": ["via", "revokedSessions"],
  "account.last_admin_protected": ["operation"],
  "auth.email_verified": [],
  "auth.login.succeeded": ["sessionId"],
  "auth.rate_limit.blocked": ["scope"],
  "auth.rate_limit.alert": ["failuresAcrossOrigins"],
  "session.revoked": ["reason"],
  "session.revoked_all": ["reason", "count"],
  "password_reset.requested": [],
  "password_reset.completed": ["revokedSessions"],
  "account.unverified_purged": [],
  "audit.purged": ["count", "olderThan"],
  "access_records.purged": ["count", "olderThan"],
  // 003 — classes, class invitations and enrollments
  "class.created": ["code", "academicYear"],
  "class.updated": ["fields"],
  "class.status_changed": ["from", "to", "cancelledInvitations"],
  "class_invitation.created": ["classId", "email"],
  "class_invitation.resent": ["classId", "sendCount"],
  "class_invitation.cancelled": ["classId", "reason"],
  "class_invitation.accepted": ["classId", "userId", "mode", "alreadyEnrolled"],
  "class_invitation.acceptance_refused": ["reason"],
  "student.registered": ["userId", "via"],
  "enrollment.created": ["classId", "userId", "invitationId"],
  "enrollment.removed": ["classId", "userId"],
  // 004 — subjects, syllabus, class calendar and plan. Never syllabus texts, topic titles or
  // descriptions, subject names, file names nor document content (FR-047).
  "subject.created": [],
  "subject.updated": ["fields", "status"],
  "class.offering_updated": ["fields", "subjectId"],
  "syllabus.uploaded": ["subjectId", "version", "mediaType", "sizeBytes"],
  "syllabus.processed": ["result", "groupCount", "itemCount", "attempts", "extractorVersion"],
  "syllabus.processing_failed": ["category", "attempts"],
  "syllabus.revision_confirmed": ["documentId", "number", "source", "groupCount", "itemCount", "languageId"],
  "class_meetings.updated": ["added", "removed", "total", "resolutions"],
  "topic.created": ["planId", "itemCount", "hasMeeting"],
  "topic.updated": ["planId", "fields"],
  "topic.merged": ["planId", "mergedTopicIds"],
  "topic.split": ["planId", "newTopicIds"],
  "topic.archived": ["planId", "reason"],
  "topic.restored": ["planId", "status"],
  "topic.completed": ["planId"],
  "topic.reopened": ["planId"],
  "topics.reordered": ["topicCount", "movedCount"],
  "class_plan.syllabus_selected": ["classId", "revisionId", "previousRevisionId", "outsideRevisionLinks"],
  "class_plan.status_changed": ["classId", "from", "to", "activatedTopics"],
  // 006 — AI foundation (specs/006-ai-foundation/contracts/audit-events.md). Only ids, versions,
  // codes and numbers: never prompts, request input, model output, proposal content, tool
  // arguments or results, resource names nor credentials (FR-062).
  "ai_execution.requested": [
    "agentKey",
    "agentVersion",
    "promptVersion",
    "modelConfigKey",
    "taskKey",
    "fallbackModelConfigKey",
    "tier",
    "selectionReason",
    "overrideIgnored",
    "resourceType",
    "riskLevel",
  ],
  "ai_execution.started": ["claim"],
  "ai_execution.completed": ["durationMs", "modelCalls", "toolCalls", "proposalId"],
  "ai_execution.failed": ["status", "errorCode", "durationMs", "modelCalls", "toolCalls"],
  "ai_execution.cancelled": ["from", "errorCode"],
  "ai_execution.cancel_requested": ["from"],
  "ai_execution.rate_limited": ["scope"],
  // 008 — a model config's circuit opened or closed (research G8).
  "ai_circuit.opened": ["configKey", "provider", "model", "failures"],
  "ai_circuit.closed": ["configKey", "provider", "model"],
  // 008 — a logical call went to the fallback model (research G6).
  "ai_execution.fallback_used": ["primaryConfigKey", "fallbackConfigKey", "reason", "primaryErrorCode"],
  // 009 — an invalid output repeated once on the next tier the task's policy allows (research H9).
  "ai_execution.escalated": ["taskKey", "fromTier", "toTier", "reason", "modelConfigKey"],
  "ai_tool.called": ["toolKey", "sequence", "durationMs"],
  "ai_tool.failed": ["toolKey", "sequence", "status", "errorCode"],
  "ai_proposal.created": ["executionId", "agentKey", "proposalType", "itemCount"],
  "ai_proposal.approved": ["itemCount"],
  "ai_proposal.partially_approved": ["itemCount", "acceptedCount"],
  "ai_proposal.rejected": ["itemCount"],
  "ai_proposal.expired": [],
  "ai_agent.enabled": ["agentKey", "version"],
  "ai_agent.disabled": ["agentKey", "version", "cancelledExecutions"],
  "ai_model_config.enabled": ["configKey", "provider", "model"],
  "ai_model_config.disabled": ["configKey", "provider", "model"],
  // 008 — a deploy changed the model of an existing config (research G3).
  "ai_model_config.changed": ["configKey", "provider", "previousModel", "model"],
  // 009 — model policy: a catalog entry's lifecycle changed in code (research H4).
  "ai_model_config.lifecycle_changed": ["configKey", "from", "to"],
  // 009 — the administrator's model override of a task (research H11).
  "ai_task_override.set": ["taskKey", "modelConfigKey", "previousModelConfigKey"],
  "ai_task_override.removed": ["taskKey", "modelConfigKey"],
  // 009 — the first crossing of a budget in its period (research H16); never a user id.
  "ai_budget.exceeded": ["scope", "period", "limit", "spent", "agentKey"],
  "ai_registry.synced": ["agents", "tools", "modelConfigs", "catalogModels", "tasks", "newVersions", "deprecated"],
  // 007 — Curriculum Agent. Never the document, the ementa text or the proposal content (FR-045).
  "curriculum_ai.analysis_requested": ["executionId", "created", "discardedProposal"],
  "curriculum_ai.proposal_applied": [
    "proposalId",
    "revisionId",
    "revisionNumber",
    "replacedDraft",
    "acceptedFields",
    "acceptedGroups",
    "groupCount",
    "itemCount",
    "unsupportedCount",
  ],
  // 010 — the exercise bank. Only ids, counts and enums: never statements, answers, solutions,
  // explanations or alternative texts.
  "exercise.created": ["type", "difficulty", "status", "setSize", "syllabusItemId"],
  "exercise.edited": ["origin", "status", "fields"],
  "exercise.approved": ["origin", "humanEdited", "batchId"],
  "exercise.discarded": ["exerciseId", "batchId"],
  "exercise.archived": ["from"],
  "exercise.restored": ["to"],
  "exercise_batch.requested": [
    "executionId",
    "difficulty",
    "total",
    "openAnswer",
    "multipleChoice",
    "code",
    "trickQuestions",
    "languageKey",
    "distribution",
    "regeneratedFromId",
  ],
  "exercise_batch.generated": ["executionId", "exercises"],
  // 011 — the work bank. Only ids, counts, enums and codes: never titles, descriptions,
  // statements, answers, rubrics, solutions, test cases, alternative texts or syllabus text.
  "work.created": ["subjectId", "status", "questionCount", "types", "topicCount", "difficulty"],
  "work.approved": ["origin", "humanEdited", "generationRequestId", "warnings"],
} as const satisfies Record<string, readonly string[]>;

export type AuditEventType = keyof typeof AUDIT_EVENT_METADATA;

/**
 * A list is only for names or ids (the changed fields of `class.updated`, the topics merged by
 * `topic.merged`), never for values; a record only for counts per kind (the resolutions of
 * `class_meetings.updated`).
 */
export type AuditMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | Readonly<Record<string, number>>;

export type AuditMetadata<T extends AuditEventType> = Partial<
  Record<(typeof AUDIT_EVENT_METADATA)[T][number], AuditMetadataValue>
>;

export type AuditTargetType =
  | "USER"
  | "INVITATION"
  | "SESSION"
  | "ADMIN_BOOTSTRAP"
  | "USER_ROLE"
  | "CLASS"
  | "CLASS_INVITATION"
  | "STUDENT_PROFILE"
  | "ENROLLMENT"
  | "SUBJECT"
  | "SYLLABUS_DOCUMENT"
  | "SYLLABUS_REVISION"
  | "CLASS_PLAN"
  | "TOPIC"
  | "AI_EXECUTION"
  | "AI_PROPOSAL"
  | "AI_AGENT"
  | "AI_MODEL_CONFIG"
  | "AI_TASK"
  | "EXERCISE"
  | "EXERCISE_BATCH"
  | "WORK";
