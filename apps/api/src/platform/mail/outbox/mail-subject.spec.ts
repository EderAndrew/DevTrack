import { describe, expect, it } from "vitest";
import { type MailSubject, MailSubjectNotRegisteredError, MailSubjectRegistry } from "./mail-subject";

const subject = (kind: MailSubject["kind"]): MailSubject => ({ kind, prepare: async () => ({ discard: "NOT_NEEDED" }) });

describe("017 MailSubjectRegistry (research N3)", () => {
  it("cada tipo tem um dono, registrado uma vez", () => {
    const registry = new MailSubjectRegistry();
    const invitations = subject("CLASS_INVITATION");
    registry.register(invitations);
    registry.register(subject("VERIFY_EMAIL"));
    expect(registry.get("CLASS_INVITATION")).toBe(invitations);
    expect(registry.kinds()).toEqual(["CLASS_INVITATION", "VERIFY_EMAIL"]);
    expect(() => registry.register(subject("CLASS_INVITATION"))).toThrow(/registered twice/);
  });

  it("um tipo sem dono é um erro de montagem, não um envio perdido em silêncio", () => {
    expect(() => new MailSubjectRegistry().get("ADMIN_ACTIVATION")).toThrow(MailSubjectNotRegisteredError);
  });
});
