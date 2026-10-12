import { describe, expect, it } from "vitest";
import {
  createSnsSigner,
  SNS_CERT_URL,
  signedSnsNotice,
  snsSubscriptionConfirmation,
  TEST_TOPIC_ARN,
  TestCertificateFetcher,
} from "../../../../test/helpers/mail-notices";
import { isSnsUrl } from "./certificate-fetcher";
import { NoticeRejected, type RawNotice } from "./notice";
import { SesNoticeAdapter } from "./ses.adapter";

const NOW = new Date("2026-10-11T12:00:00.000Z");
const MESSAGE_ID = "<0f8fad5b-d9cb-469f-a165-70867728950e.2@devtrack.test>";
const signer = createSnsSigner();
const intruder = createSnsSigner();

const setup = () => {
  const fetcher = new TestCertificateFetcher().serve(SNS_CERT_URL, signer);
  return { fetcher, adapter: new SesNoticeAdapter(TEST_TOPIC_ARN, fetcher) };
};
const raw = (notice: { headers: Record<string, string>; body: string }): RawNotice => ({ headers: notice.headers, body: Buffer.from(notice.body) });
const reasonOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "ACCEPTED";
  } catch (error) {
    return error instanceof NoticeRejected ? error.reason : "CRASHED";
  }
};

describe("017/FR-014 adaptador SES por SNS (research N6, N7)", () => {
  it.each([
    ["Delivery", undefined, "DELIVERED"],
    ["Bounce", "Permanent", "BOUNCED"],
    ["Bounce", "Transient", "TEMPORARY"],
    ["Complaint", undefined, "COMPLAINED"],
    ["Reject", undefined, "REJECTED"],
    ["Open", undefined, "IGNORED"],
  ] as const)("%s (%s) → %s", async (type, bounceType, kind) => {
    const { adapter } = setup();
    const notice = signedSnsNotice({ type, bounceType, messageId: MESSAGE_ID, at: NOW, signer, id: "sns-1" });
    expect(await adapter.verify(raw(notice), NOW)).toEqual({
      type: "notice",
      notice: { noticeId: "sns-1", kind, messageId: MESSAGE_ID, occurredAt: NOW },
    });
  });

  it("017/FR-011 recusa SignatureVersion 1, certificado de outro host e certificado que não assina", async () => {
    const { adapter, fetcher } = setup();
    expect(await reasonOf(adapter.verify(raw(signedSnsNotice({ type: "Delivery", messageId: MESSAGE_ID, at: NOW, signer, signatureVersion: "1" })), NOW))).toBe("SIGNATURE");
    for (const certUrl of [
      "https://sns.evil.com/cert.pem",
      "https://sns.sa-east-1.amazonaws.com.evil.com/cert.pem",
      "http://sns.sa-east-1.amazonaws.com/cert.pem",
    ]) {
      fetcher.serve(certUrl, signer);
      expect(await reasonOf(adapter.verify(raw(signedSnsNotice({ type: "Delivery", messageId: MESSAGE_ID, at: NOW, signer, certUrl })), NOW)), certUrl).toBe("SIGNATURE");
    }
    expect(fetcher.fetched).toEqual([]);
    expect(await reasonOf(adapter.verify(raw(signedSnsNotice({ type: "Delivery", messageId: MESSAGE_ID, at: NOW, signer, signWith: intruder })), NOW))).toBe("SIGNATURE");
  });

  it("017/FR-011 recusa outro tópico e corpo alterado", async () => {
    const { adapter } = setup();
    const other = signedSnsNotice({ type: "Bounce", messageId: MESSAGE_ID, at: NOW, signer, topicArn: "arn:aws:sns:sa-east-1:123456789012:outro" });
    expect(await reasonOf(adapter.verify(raw(other), NOW))).toBe("TOPIC");
    const good = signedSnsNotice({ type: "Delivery", messageId: MESSAGE_ID, at: NOW, signer });
    const tampered = JSON.parse(good.body) as Record<string, string>;
    tampered.Message = tampered.Message!.replace("Delivery", "Complaint");
    expect(await reasonOf(adapter.verify({ ...raw(good), body: Buffer.from(JSON.stringify(tampered)) }, NOW))).toBe("SIGNATURE");
    expect(await reasonOf(adapter.verify({ ...raw(good), body: Buffer.from("{quebrado") }, NOW))).toBe("FORMAT");
  });

  it("confirma a assinatura do tópico configurado pelo SubscribeURL; outro tópico nem é buscado", async () => {
    const { adapter, fetcher } = setup();
    expect(await adapter.verify(raw(snsSubscriptionConfirmation({ signer })), NOW)).toEqual({ type: "confirmed" });
    expect(fetcher.confirmed).toHaveLength(1);
    expect(await reasonOf(adapter.verify(raw(snsSubscriptionConfirmation({ signer, topicArn: "arn:aws:sns:sa-east-1:123456789012:outro" })), NOW))).toBe("TOPIC");
    expect(await reasonOf(adapter.verify(raw(snsSubscriptionConfirmation({ signer, subscribeUrl: "https://evil.example/confirm" })), NOW))).toBe("SIGNATURE");
    expect(fetcher.confirmed).toHaveLength(1);
  });

  it("a regra de host do SNS", () => {
    expect(isSnsUrl("https://sns.us-east-1.amazonaws.com/x.pem")).toBe(true);
    for (const url of ["http://sns.us-east-1.amazonaws.com/x.pem", "https://sns.evil.com/x", "https://sns.us-east-1.amazonaws.com.evil.com/x", "https://user@sns.us-east-1.amazonaws.com/x", "https://sns.us-east-1.amazonaws.com:8443/x", "nada"]) {
      expect(isSnsUrl(url), url).toBe(false);
    }
  });
});
