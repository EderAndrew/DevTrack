import { describe, expect, it } from "vitest";
import { signedResendNotice } from "../../../../test/helpers/mail-notices";
import { NoticeRejected, parseMessageId, type RawNotice } from "./notice";
import { ResendNoticeAdapter } from "./resend.adapter";

const SECRET = Buffer.from("segredo-de-teste-do-adaptador-017");
const NOW = new Date("2026-10-11T12:00:00.000Z");
const MESSAGE_ID = "<0f8fad5b-d9cb-469f-a165-70867728950e.1@devtrack.test>";
const adapter = new ResendNoticeAdapter(SECRET);

const raw = (notice: { headers: Record<string, string>; body: string }): RawNotice => ({
  headers: notice.headers,
  body: Buffer.from(notice.body),
});
const reasonOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "ACCEPTED";
  } catch (error) {
    return error instanceof NoticeRejected ? error.reason : "CRASHED";
  }
};

describe("017/FR-014 adaptador Resend (research N6, N7)", () => {
  it.each([
    ["email.delivered", undefined, "DELIVERED"],
    ["email.bounced", "Permanent", "BOUNCED"],
    ["email.bounced", "Transient", "TEMPORARY"],
    ["email.delivery_delayed", undefined, "TEMPORARY"],
    ["email.complained", undefined, "COMPLAINED"],
    ["email.failed", undefined, "REJECTED"],
    ["email.opened", undefined, "IGNORED"],
    ["email.clicked", undefined, "IGNORED"],
    ["email.sent", undefined, "IGNORED"],
  ] as const)("%s (%s) → %s", async (type, bounceType, kind) => {
    const notice = signedResendNotice({ type, bounceType, messageId: MESSAGE_ID, at: NOW, secret: SECRET, id: "msg_1" });
    const result = await adapter.verify(raw(notice), NOW);
    expect(result).toEqual({ type: "notice", notice: { noticeId: "msg_1", kind, messageId: MESSAGE_ID, occurredAt: NOW } });
  });

  it("017/FR-011 aceita quando uma das várias assinaturas do cabeçalho confere", async () => {
    const notice = signedResendNotice({ type: "email.delivered", messageId: MESSAGE_ID, at: NOW, secret: SECRET });
    notice.headers["svix-signature"] = `v1,AAAA v1a,xyz ${notice.headers["svix-signature"]}`;
    expect(await reasonOf(adapter.verify(raw(notice), NOW))).toBe("ACCEPTED");
  });

  it("017/FR-011 recusa assinatura errada, corpo alterado e segredo de outro ambiente", async () => {
    const good = signedResendNotice({ type: "email.delivered", messageId: MESSAGE_ID, at: NOW, secret: SECRET });
    expect(await reasonOf(adapter.verify({ ...raw(good), body: Buffer.from(good.body.replace("delivered", "bounced")) }, NOW))).toBe("SIGNATURE");
    const other = signedResendNotice({ type: "email.delivered", messageId: MESSAGE_ID, at: NOW, secret: Buffer.from("outro-ambiente-0000000") });
    expect(await reasonOf(adapter.verify(raw(other), NOW))).toBe("SIGNATURE");
    expect(await reasonOf(adapter.verify(raw({ ...good, headers: { ...good.headers, "svix-signature": "v1,bm9wZQ==" } }), NOW))).toBe("SIGNATURE");
    for (const header of ["svix-id", "svix-timestamp", "svix-signature"]) {
      const headers = { ...good.headers };
      delete headers[header];
      expect(await reasonOf(adapter.verify(raw({ ...good, headers }), NOW)), header).not.toBe("ACCEPTED");
    }
  });

  it("017/FR-011 recusa timestamp fora de ±5 min do relógio do servidor", async () => {
    for (const offset of [-5 * 60_000 - 1_000, 5 * 60_000 + 1_000]) {
      const notice = signedResendNotice({ type: "email.delivered", messageId: MESSAGE_ID, at: NOW, signedAt: new Date(NOW.getTime() + offset), secret: SECRET });
      expect(await reasonOf(adapter.verify(raw(notice), NOW))).toBe("TIMESTAMP");
    }
    const edge = signedResendNotice({ type: "email.delivered", messageId: MESSAGE_ID, at: NOW, signedAt: new Date(NOW.getTime() - 4 * 60_000), secret: SECRET });
    expect(await reasonOf(adapter.verify(raw(edge), NOW))).toBe("ACCEPTED");
  });

  it("017/FR-011 JSON malformado ou fora do formato, com assinatura válida → FORMAT", async () => {
    for (const rawBody of ["{não é json", JSON.stringify({ data: {} }), JSON.stringify({ type: 1, created_at: "x" })]) {
      const notice = signedResendNotice({ type: "email.delivered", messageId: MESSAGE_ID, at: NOW, secret: SECRET, rawBody });
      expect(await reasonOf(adapter.verify(raw(notice), NOW))).toBe("FORMAT");
    }
  });

  it("lê o Message-ID também de uma lista de cabeçalhos", async () => {
    const rawBody = JSON.stringify({ type: "email.delivered", created_at: NOW.toISOString(), data: { headers: [{ name: "Message-ID", value: MESSAGE_ID }] } });
    const notice = signedResendNotice({ type: "email.delivered", messageId: null, at: NOW, secret: SECRET, rawBody });
    const result = await adapter.verify(raw(notice), NOW);
    expect(result.type === "notice" && result.notice.messageId).toBe(MESSAGE_ID);
  });
});

describe("017 Message-ID (research N5)", () => {
  it("lê o envio e a tentativa do nosso Message-ID, com ou sem < >", () => {
    expect(parseMessageId(MESSAGE_ID)).toEqual({ deliveryId: "0f8fad5b-d9cb-469f-a165-70867728950e", attempt: 1, domain: "devtrack.test" });
    expect(parseMessageId("0F8FAD5B-D9CB-469F-A165-70867728950E.7@Devtrack.Test")?.attempt).toBe(7);
  });

  it("ignora Message-IDs de outros (ou nulos)", () => {
    for (const other of [null, "", "<abc@gmail.com>", "<0f8fad5b-d9cb-469f-a165-70867728950e@devtrack.test>", "<0f8fad5b-d9cb-469f-a165-70867728950e.0@x.test>"]) {
      expect(parseMessageId(other)).toBeNull();
    }
  });
});
