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
