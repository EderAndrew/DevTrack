import { describe, expect, it } from "vitest";
import {
  ClassInvitationPageSchema,
  ClassInvitationViewSchema,
  DeliveryIssueSchema,
  DeliveryStateSchema,
  EmptyResponseSchema,
  ErrorCodeSchema,
  ProviderNoticeParamsSchema,
} from "../src/index.js";

const invitation = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "aluno@example.test",
  status: "PENDING",
  expiresAt: "2026-10-18T12:00:00.000Z",
  sendCount: 1,
  lastSentAt: "2026-10-11T12:00:00.000Z",
  delivery: "SENT",
  deliveryIssue: null,
  createdAt: "2026-10-11T12:00:00.000Z",
};

describe("017 contrato do envio dos convites (contracts/http-api.md)", () => {
  it("017/FR-015 o envio ganha UNDELIVERED, e o motivo é BOUNCED, COMPLAINED ou REJECTED", () => {
    expect(DeliveryStateSchema.options).toEqual(["SENDING", "SENT", "FAILED", "UNDELIVERED"]);
    expect(DeliveryIssueSchema.options).toEqual(["BOUNCED", "COMPLAINED", "REJECTED"]);
  });

  it("017/FR-015 deliveryIssue existe exatamente quando o envio é UNDELIVERED", () => {
    for (const delivery of ["SENDING", "SENT", "FAILED"]) {
      expect(ClassInvitationViewSchema.safeParse({ ...invitation, delivery }).success, delivery).toBe(true);
      expect(ClassInvitationViewSchema.safeParse({ ...invitation, delivery, deliveryIssue: "BOUNCED" }).success, delivery).toBe(false);
    }
    for (const deliveryIssue of DeliveryIssueSchema.options) {
      expect(ClassInvitationViewSchema.safeParse({ ...invitation, delivery: "UNDELIVERED", deliveryIssue }).success).toBe(true);
    }
    expect(ClassInvitationViewSchema.safeParse({ ...invitation, delivery: "UNDELIVERED" }).success).toBe(false);
    expect(ClassInvitationViewSchema.safeParse({ ...invitation, delivery: "UNDELIVERED", deliveryIssue: "SPAM" }).success).toBe(false);
  });

  it("017/FR-015 deliveryIssue é obrigatório no corpo (null quando não há) e a página o confere em cada item", () => {
    const { deliveryIssue: _omitted, ...withoutIssue } = invitation;
    expect(ClassInvitationViewSchema.safeParse(withoutIssue).success).toBe(false);
    const undelivered = { ...invitation, delivery: "UNDELIVERED" };
    expect(ClassInvitationPageSchema.safeParse({ items: [invitation, undelivered], nextCursor: null }).success).toBe(false);
  });
});

describe("017 contrato dos avisos do provedor (contracts/http-api.md)", () => {
  it("017/FR-014 :provider é resend ou ses, e nada mais", () => {
    expect(ProviderNoticeParamsSchema.safeParse({ provider: "resend" }).success).toBe(true);
    expect(ProviderNoticeParamsSchema.safeParse({ provider: "ses" }).success).toBe(true);
    for (const provider of ["none", "sendgrid", "RESEND", ""]) {
      expect(ProviderNoticeParamsSchema.safeParse({ provider }).success, provider).toBe(false);
    }
    expect(ProviderNoticeParamsSchema.safeParse({ provider: "ses", extra: "x" }).success).toBe(false);
  });

  it("017/FR-011 a resposta de um aviso aceito é {} e a recusa é NOTICE_REJECTED", () => {
    expect(EmptyResponseSchema.safeParse({}).success).toBe(true);
    expect(EmptyResponseSchema.safeParse({ changed: true }).success).toBe(false);
    expect(ErrorCodeSchema.options).toContain("NOTICE_REJECTED");
  });
});
