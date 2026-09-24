import { describe, expect, it } from "vitest";
import { AUDIT_EVENT_METADATA } from "./audit-event-types";
import { AuditMetadataError, AuditService, sanitizeMetadata } from "./audit.service";

describe("AuditService metadata allowlist (FR-071)", () => {
  it("accepts the listed keys and drops undefined values", () => {
    expect(sanitizeMetadata("role.granted", { userId: "u1", role: "TEACHER", via: undefined })).toEqual({
      userId: "u1",
      role: "TEACHER",
    });
  });

  it.each(["password", "token", "tokenHash", "secret", "cookie", "ip"])("rejects key %s", (key) => {
    expect(() => sanitizeMetadata("auth.login.succeeded", { [key]: "x" })).toThrow(AuditMetadataError);
  });

  it("rejects unknown event types", () => {
    expect(() => sanitizeMetadata("made.up", {})).toThrow(AuditMetadataError);
  });

  it("no event type allows a secret-like key", () => {
    const forbidden = /password|token|secret|cookie|hash/i;
    for (const [type, keys] of Object.entries(AUDIT_EVENT_METADATA)) {
      for (const key of keys) expect(forbidden.test(key), `${type}.${key}`).toBe(false);
    }
  });

  it("003/FR-061 accepts the 003 metadata keys and rejects anything else", () => {
    expect(sanitizeMetadata("class.updated", { fields: "name,period" })).toEqual({ fields: "name,period" });
    expect(
      sanitizeMetadata("class_invitation.accepted", { classId: "c1", userId: "u1", mode: "CREATE_ACCOUNT", alreadyEnrolled: false }),
    ).toEqual({ classId: "c1", userId: "u1", mode: "CREATE_ACCOUNT", alreadyEnrolled: false });
    expect(sanitizeMetadata("role.granted", { userId: "u1", role: "STUDENT", via: "CLASS_INVITATION" })).toEqual({
      userId: "u1",
      role: "STUDENT",
      via: "CLASS_INVITATION",
    });
    expect(() => sanitizeMetadata("class_invitation.created", { classId: "c1", token: "x" })).toThrow(AuditMetadataError);
    expect(() => sanitizeMetadata("student.registered", { ra: "2026A-01" })).toThrow(AuditMetadataError);
    expect(() => sanitizeMetadata("enrollment.removed", { name: "Aluno" })).toThrow(AuditMetadataError);
  });

  it("004/FR-047 accepts the 004 metadata keys and rejects texts, names and file names", () => {
    expect(sanitizeMetadata("subject.created", {})).toEqual({});
    expect(sanitizeMetadata("subject.updated", { fields: ["name"], status: "INACTIVE" })).toEqual({
      fields: ["name"],
      status: "INACTIVE",
    });
    expect(
      sanitizeMetadata("syllabus.uploaded", { subjectId: "s1", version: 2, mediaType: "PDF", sizeBytes: 3058 }),
    ).toEqual({ subjectId: "s1", version: 2, mediaType: "PDF", sizeBytes: 3058 });
    expect(sanitizeMetadata("class_meetings.updated", { added: 2, removed: 1, total: 18, resolutions: { MOVE: 1 } })).toEqual({
      added: 2,
      removed: 1,
      total: 18,
      resolutions: { MOVE: 1 },
    });
    expect(sanitizeMetadata("topic.merged", { planId: "p1", mergedTopicIds: ["t2", "t3"] })).toEqual({
      planId: "p1",
      mergedTopicIds: ["t2", "t3"],
    });
    expect(() => sanitizeMetadata("subject.created", { name: "POO" })).toThrow(AuditMetadataError);
    expect(() => sanitizeMetadata("syllabus.uploaded", { originalFilename: "ementa.pdf" })).toThrow(AuditMetadataError);
    expect(() => sanitizeMetadata("syllabus.processed", { syllabusText: "Exploração…" })).toThrow(AuditMetadataError);
    expect(() => sanitizeMetadata("topic.created", { planId: "p1", title: "Classes" })).toThrow(AuditMetadataError);
    expect(() => sanitizeMetadata("topic.updated", { planId: "p1", description: "x" })).toThrow(AuditMetadataError);
  });

  it("004/FR-047 no 004 event type allows a text-bearing key", () => {
    const text = /^(name|title|description|text|filename|originalFilename|syllabusText|competencyText|content)$/i;
    const types = Object.keys(AUDIT_EVENT_METADATA).filter((type) =>
      /^(subject\.|syllabus\.|class\.offering_updated$|class_meetings\.|topics?\.|class_plan\.)/.test(type),
    );
    expect(types).toHaveLength(17);
    for (const type of types) {
      for (const key of AUDIT_EVENT_METADATA[type as keyof typeof AUDIT_EVENT_METADATA]) {
        expect(text.test(key), `${type}.${key}`).toBe(false);
      }
    }
  });

  it("record() refuses before writing", async () => {
    const writes: unknown[] = [];
    const fakeTx = { auditEvent: { create: async (args: unknown) => void writes.push(args) } };
    await expect(
      new AuditService().record(fakeTx as never, {
        type: "auth.email_verified",
        actorType: "ANONYMOUS",
        metadata: { password: "x" } as never,
      }),
    ).rejects.toThrow(AuditMetadataError);
    expect(writes).toHaveLength(0);
  });
});
