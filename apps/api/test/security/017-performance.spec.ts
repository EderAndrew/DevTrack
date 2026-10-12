import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FailingMailer, InMemoryMailer } from "../../src/platform/mail/in-memory.mailer";
import type { MailMessage, MailSendResult } from "../../src/platform/mail/mailer";
import { createUser, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** A mailer that answers after 5 s: the request must not wait for it. */
class SlowMailer extends InMemoryMailer {
  override async send(message: MailMessage): Promise<MailSendResult> {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    return super.send(message);
  }
}

const SAMPLES = 6;
/** Every answer comes well before the slow mailer could have answered. */
const MAX_RESPONSE_MS = 1_000;
/** How far apart the medians of two situations may be (existing vs unknown e-mail, mailer up/down/slow). */
const MEDIAN_TOLERANCE_MS = 250;

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
/** Status and body without per-request ids: what a caller can tell apart. */
const shape = (res: { status: number; body: unknown }) => ({ status: res.status, body: res.body });

/**
 * 017/SC-002, 017/FR-002: the e-mail verification resend and the password reset answer the same
 * body, in the same time, with the mailer up, down (`temporary`) or slow (5 s), for an existing and
 * an unknown e-mail; the request writes the delivery and returns without waiting for SMTP.
 */
describe("017/SC-002 017/FR-002 a resposta não espera o envio nem revela o e-mail", () => {
  const apps: Record<"up" | "down" | "slow", TestApp> = {} as never;

  beforeAll(async () => {
    apps.up = await createTestApp({ mailer: new InMemoryMailer() });
    apps.down = await createTestApp({ mailer: new FailingMailer("temporary") });
    apps.slow = await createTestApp({ mailer: new SlowMailer() });
    await resetDb(apps.up.prisma);
  });
  afterAll(async () => {
    for (const t of Object.values(apps)) await t.close();
  });

  const flows = [
    { name: "reenvio da confirmação", path: "/api/auth/verify-email/resend", verified: false, kind: "VERIFY_EMAIL" as const },
    { name: "redefinição de senha", path: "/api/auth/password-reset/request", verified: true, kind: "PASSWORD_RESET" as const },
  ];

  it.each(flows)("017/SC-002 $name: mesmo corpo e mesma distribuição de tempo, com o mailer no ar, fora e lento", async (flow) => {
    const timings: Record<string, number[]> = {};
    let reference: ReturnType<typeof shape> | null = null;
    for (const [situation, t] of Object.entries(apps)) {
      for (const existing of [true, false]) {
        const key = `${situation}/${existing ? "existente" : "inexistente"}`;
        timings[key] = [];
        for (let i = 0; i < SAMPLES; i += 1) {
          const email = existing
            ? (await createUser(t, { email: uniqueEmail("tempo"), verified: flow.verified })).email
            : uniqueEmail("ninguem");
          const deliveriesBefore = await t.prisma.mailDelivery.count({ where: { kind: flow.kind } });
          const started = performance.now();
          const res = await api(t).post(flow.path, { email });
          const elapsed = performance.now() - started;
          timings[key].push(elapsed);

          reference ??= shape(res);
          expect(shape(res), key).toEqual(reference);
          expect(elapsed, key).toBeLessThan(MAX_RESPONSE_MS);
          // FR-002: one delivery row written with the request (none for an unknown e-mail).
          expect(await t.prisma.mailDelivery.count({ where: { kind: flow.kind } }), key).toBe(deliveriesBefore + (existing ? 1 : 0));
        }
      }
    }
    const medians = Object.fromEntries(Object.entries(timings).map(([key, values]) => [key, median(values)]));
    const spread = Math.max(...Object.values(medians)) - Math.min(...Object.values(medians));
    expect(spread, JSON.stringify(medians)).toBeLessThan(MEDIAN_TOLERANCE_MS);
  });

  it("017/FR-002 com o mailer lento, o envio ainda está em voo quando a resposta chega", async () => {
    const t = apps.slow;
    const user = await createUser(t, { email: uniqueEmail("em-voo") });
    const res = await api(t).post("/api/auth/password-reset/request", { email: user.email });
    expect(res.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const delivery = await t.prisma.mailDelivery.findFirstOrThrow({ where: { kind: "PASSWORD_RESET", userId: user.id } });
    expect(delivery).toMatchObject({ status: "PENDING", attempts: 1, sentAt: null });
    await t.flushMail();
    expect(await t.prisma.mailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).toMatchObject({ status: "SENT" });
  }, 15_000);
});
