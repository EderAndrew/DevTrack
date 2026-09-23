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

  it("record() refuses before writing", async () => {
    const writes: unknown[] = [];
    const fakeTx = { auditEvent: { create: async (args: unknown) => void writes.push(args) } };
    await expect(
      new AuditService().record(fakeTx as never, {
        type: "auth.signup",
        actorType: "ANONYMOUS",
        metadata: { password: "x" } as never,
      }),
    ).rejects.toThrow(AuditMetadataError);
    expect(writes).toHaveLength(0);
  });
});
