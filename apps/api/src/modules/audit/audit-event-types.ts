/**
 * Audit catalogue of contracts/audit-events.md (specs 001, 003 and 004): event type → metadata keys
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
  "syllabus.revision_confirmed": ["documentId", "number", "source", "groupCount", "itemCount"],
  "class_meetings.updated": ["added", "removed", "total", "resolutions"],
  "topic.created": ["planId", "itemCount", "hasMeeting"],
  "topic.updated": ["planId", "fields"],
  "topic.merged": ["planId", "mergedTopicIds"],
  "topic.split": ["planId", "newTopicIds"],
  "topic.archived": ["planId", "reason"],
  "topic.restored": ["planId", "status"],
  "topics.reordered": ["topicCount", "movedCount"],
  "class_plan.syllabus_selected": ["classId", "revisionId", "previousRevisionId", "outsideRevisionLinks"],
  "class_plan.status_changed": ["classId", "from", "to", "activatedTopics"],
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
  | "TOPIC";
