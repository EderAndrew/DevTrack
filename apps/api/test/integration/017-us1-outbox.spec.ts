import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MailKind } from "../../src/generated/prisma/client";
import { AdminBootstrapService } from "../../src/modules/admin-bootstrap/admin-bootstrap.service";
import { hashToken } from "../../src/platform/crypto/tokens";
import type { TemplateName } from "../../src/platform/mail/templates";
import { MailDeliveryWorker } from "../../src/platform/mail/outbox/mail-delivery.worker";
import { MailOutbox } from "../../src/platform/mail/outbox/mail-outbox";
import { FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createClass, createUser, loginAs, type TestUser, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

/** The token of a link in an e-mail text. */
const tokenIn = (text: string) => text.match(/token=([\w-]+)/)![1]!;

/**
 * 017/US1 (contracts/mail-delivery.md): every e-mail of the six kinds goes through the one outbox.
 * The worker's timer is off; `runOnce(now)` runs a cycle at the test's clock (`FixedClock`, started
 * at the real time so the links minted by the requests are live).
 */
describe("017/US1 todo e-mail sobrevive a uma falha de envio", () => {
  const clock = new FixedClock(new Date());
  let t: TestApp;
  let worker: MailDeliveryWorker;
  let admin: TestUser;
  let manager: TestUser;
  let teacher: TestUser;

  beforeAll(async () => {
    t = await createTestApp({ clock });
    worker = t.get(MailDeliveryWorker);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    t.mailer.clear();
    t.mailer.setFailing(false);
    admin = await createUser(t, { roles: ["ADMIN"], name: "Admin Jornada" });
    manager = await createUser(t, { roles: ["MANAGER"], name: "Gestora" });
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
  });

  const deliveries = (kind?: MailKind) => t.prisma.mailDelivery.findMany({ where: kind ? { kind } : {}, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const advance = async (ms: number) => {
    clock.advance(ms);
    return worker.runOnce(clock.now());
  };
  const auditOf = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { occurredAt: "asc" } });

  /**
   * One way to ask for each kind of e-mail, the address it goes to, its template, and how to tell
   * whether a token still works (a preview, or the action itself).
   */
  interface KindCase {
    kind: MailKind;
    template: TemplateName;
    /** Asks for the e-mail through the API (or the CLI's service); returns the recipient and the subject id. */
    request(): Promise<{ email: string; subjectId: string }>;
    works(token: string): Promise<boolean>;
    /** Makes the subject no longer need the e-mail; returns the expected discard reason. */
    retire: Array<{ name: string; apply: (subjectId: string) => Promise<void>; reason: string }>;
  }

  const kinds: KindCase[] = [
    {
      kind: "VERIFY_EMAIL",
      template: "verify-email",
      async request() {
        const user = await createUser(t, { verified: false, email: uniqueEmail("verificar") });
        expect((await api(t).post("/api/auth/verify-email/resend", { email: user.email })).status).toBe(202);
        return { email: user.email, subjectId: user.id };
      },
      works: async (token) => (await api(t).post("/api/auth/verify-email", { token })).status === 200,
      retire: [
        { name: "e-mail já verificado", reason: "NOT_NEEDED", apply: async (id) => void (await t.prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } })) },
        { name: "conta SUSPENDED", reason: "REVOKED", apply: async (id) => void (await t.prisma.user.update({ where: { id }, data: { status: "SUSPENDED", statusChangedAt: new Date() } })) },
      ],
    },
    {
      kind: "PASSWORD_RESET",
      template: "password-reset",
      async request() {
        const user = await createUser(t, { email: uniqueEmail("senha") });
        expect((await api(t).post("/api/auth/password-reset/request", { email: user.email })).status).toBe(202);
        return { email: user.email, subjectId: user.id };
      },
      works: async (token) =>
        (await api(t).post("/api/auth/password-reset/confirm", { token, password: "senha-nova-do-teste-017" })).status === 200,
      retire: [
        { name: "conta SUSPENDED", reason: "REVOKED", apply: async (id) => void (await t.prisma.user.update({ where: { id }, data: { status: "SUSPENDED", statusChangedAt: new Date() } })) },
      ],
    },
    {
      kind: "INVITATION_TEACHER",
      template: "invitation-teacher",
      async request() {
        const email = uniqueEmail("prof-convidada");
        const res = await api(t, { cookie: await loginAs(t, manager) }).post("/api/teacher-invitations", { email, displayName: "Prof" });
        expect(res.status).toBe(201);
        return { email, subjectId: res.body.id as string };
      },
      works: async (token) => (await api(t).post("/api/invitations/preview", { token })).status === 200,
      retire: [
        { name: "convite revogado", reason: "REVOKED", apply: async (id) => void (await t.prisma.invitation.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } })) },
        { name: "convite vencido", reason: "EXPIRED", apply: async (id) => void (await t.prisma.invitation.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } })) },
      ],
    },
    {
      kind: "INVITATION_MANAGER",
      template: "invitation-manager",
      async request() {
        const email = uniqueEmail("gestora-convidada");
        const res = await api(t, { cookie: await loginAs(t, admin) }).post("/api/manager-invitations", { email, displayName: "Gestora" });
        expect(res.status).toBe(201);
        return { email, subjectId: res.body.id as string };
      },
      works: async (token) => (await api(t).post("/api/invitations/preview", { token })).status === 200,
      retire: [
        {
          name: "convite aceito",
          reason: "ACCEPTED",
          apply: async (id) => void (await t.prisma.invitation.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: manager.id } })),
        },
      ],
    },
    {
      kind: "CLASS_INVITATION",
      template: "class-invitation",
      async request() {
        const email = uniqueEmail("aluno-convidado");
        const schoolClass = await createClass(t, teacher.id);
        const res = await api(t, { cookie: await loginAs(t, teacher) }).post(`/api/classes/${schoolClass.id}/invitations`, { email });
        expect(res.status).toBe(201);
        return { email, subjectId: res.body.id as string };
      },
      works: async (token) => (await api(t).post("/api/class-invitations/preview", { token })).status === 200,
      retire: [
        {
          name: "convite cancelado",
          reason: "REVOKED",
          apply: async (id) =>
            void (await t.prisma.classInvitation.update({
              where: { id },
              data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: teacher.id, cancelReason: "TEACHER" },
            })),
        },
        { name: "convite aceito", reason: "ACCEPTED", apply: async (id) => void (await t.prisma.classInvitation.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date() } })) },
        { name: "convite vencido", reason: "EXPIRED", apply: async (id) => void (await t.prisma.classInvitation.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } })) },
      ],
    },
    {
      kind: "ADMIN_ACTIVATION",
      template: "admin-activation",
      async request() {
        // The CLI's service: the first attempt is synchronous; nobody is ADMIN in this database yet.
        await t.prisma.userRole.deleteMany({ where: { role: { key: "ADMIN" } } });
        const email = uniqueEmail("primeira-admin");
        const result = await t.get(AdminBootstrapService).run({ email, printLink: false, operator: { host: "teste", user: "op" } });
        expect(result.outcome).toBe("PENDING");
        const bootstrap = await t.prisma.adminBootstrap.findFirstOrThrow({ where: { email } });
        return { email, subjectId: bootstrap.id };
      },
      works: async (token) => (await api(t).post("/api/admin-activation/preview", { token })).status === 200,
      retire: [
        { name: "bootstrap concluído", reason: "NOT_NEEDED", apply: async (id) => void (await t.prisma.adminBootstrap.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } })) },
        { name: "bootstrap vencido", reason: "EXPIRED", apply: async (id) => void (await t.prisma.adminBootstrap.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } })) },
      ],
    },
  ];

  describe.each(kinds.map((k) => [k.kind, k] as const))("017/FR-001 017/FR-007 tipo %s", (_kind, kase) => {
    it("017/FR-001 a linha nasce com o pedido e a primeira tentativa sai depois do commit, com o nosso Message-ID", async () => {
      const { email } = await kase.request();
      await t.flushMail();
      const [delivery] = await deliveries(kase.kind);
      expect(delivery).toMatchObject({ status: "SENT", attempts: 1, nextAttemptAt: null, messageId: `<${delivery!.id}.1@devtrack.test>` });
      const sent = t.mailer.messagesFor(email);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ template: kase.template, messageId: delivery!.messageId });
      expect(await kase.works(tokenIn(sent[0]!.text))).toBe(true);
    });

    it("017/US1-2 a nova tentativa gera link novo e mata o anterior", async () => {
      t.mailer.setFailing(true);
      const { email } = await kase.request();
      await t.flushMail();
      const failedToken = tokenIn(t.mailer.failed.at(-1)!.text);
      const [pending] = await deliveries(kase.kind);
      expect(pending).toMatchObject({ status: "PENDING", attempts: 1 });

      t.mailer.setFailing(false);
      expect(await advance(2 * MINUTE)).toBe(1);
      const sent = t.mailer.messagesFor(email);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.messageId).toBe(`<${pending!.id}.2@devtrack.test>`);
      expect(await t.prisma.mailDelivery.findUniqueOrThrow({ where: { id: pending!.id } })).toMatchObject({ status: "SENT", attempts: 2 });
      expect(await kase.works(failedToken)).toBe(false);
      expect(await kase.works(tokenIn(sent[0]!.text))).toBe(true);
    });

    it.each(kase.retire.map((r) => [r.name, r] as const))("017/US1-6 017/FR-006 %s antes da nova tentativa: DISCARDED, nada sai", async (_name, retire) => {
      t.mailer.setFailing(true);
      const { subjectId } = await kase.request();
      await t.flushMail();
      await retire.apply(subjectId);
      t.mailer.setFailing(false);
      t.mailer.clear();

      await advance(2 * MINUTE);
      const [delivery] = await deliveries(kase.kind);
      expect(delivery).toMatchObject({ status: "DISCARDED", discardReason: retire.reason, nextAttemptAt: null });
      expect(t.mailer.outbox).toHaveLength(0);
      expect((await auditOf("mail_delivery.discarded")).map((event) => event.metadata)).toEqual([{ kind: kase.kind, reason: retire.reason }]);
    });
  });

  it("017/US1-1 servidor fora: a redefinição de senha responde o de sempre e o e-mail fica pendente", async () => {
    const user = await createUser(t);
    const other = await createUser(t);
    const normal = await api(t).post("/api/auth/password-reset/request", { email: other.email });
    t.mailer.setFailing(true);
    const failing = await api(t).post("/api/auth/password-reset/request", { email: user.email });
    expect([failing.status, failing.body]).toEqual([normal.status, normal.body]);
    await t.flushMail();
    const pending = await t.prisma.mailDelivery.findFirstOrThrow({ where: { kind: "PASSWORD_RESET", userId: user.id } });
    expect(pending).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "ECONNREFUSED", sentAt: null });
  });

  it("017/US1-2 servidor de volta: sai na próxima tentativa, uma única vez", async () => {
    t.mailer.setFailing(true);
    const { email } = await kinds[1]!.request();
    await t.flushMail();
    t.mailer.setFailing(false);
    expect(await advance(30_000)).toBe(0);
    expect(await advance(MINUTE)).toBe(1);
    expect(await advance(DAY_MS)).toBe(0);
    expect(t.mailer.messagesFor(email)).toHaveLength(1);
    expect((await deliveries("PASSWORD_RESET"))[0]).toMatchObject({ status: "SENT", attempts: 2 });
  });

  it("017/US1-3 017/FR-003 as 7 tentativas com as esperas da 003, depois FAILED auditado sem conteúdo", async () => {
    t.mailer.setFailing(true);
    const { email } = await kinds[2]!.request();
    await t.flushMail();
    const waits = [1, 5, 15, 60, 180, 360].map((minutes) => minutes * MINUTE);
    for (const [index, wait] of waits.entries()) {
      // One second before the wait ends nothing happens; at its end the next attempt goes.
      expect(await advance(wait - 1000)).toBe(0);
      expect(await advance(1000)).toBe(1);
      expect((await deliveries())[0]!.attempts).toBe(index + 2);
    }
    const [failed] = await deliveries();
    expect(failed).toMatchObject({ status: "FAILED", attempts: 7, nextAttemptAt: null, lastErrorCode: "ECONNREFUSED" });
    expect(await advance(DAY_MS)).toBe(0);
    const audit = await auditOf("mail_delivery.failed");
    expect(audit).toMatchObject([
      { actorType: "SYSTEM", targetType: "MAIL_DELIVERY", targetId: failed!.id, metadata: { kind: "INVITATION_TEACHER", attempts: 7, errorCode: "ECONNREFUSED" } },
    ]);
    expect(JSON.stringify(audit, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value))).not.toContain(email);
  });

  it("017/US1-4 o mesmo pedido duas vezes: um envio por pedido, nenhum sai duas vezes", async () => {
    const user = await createUser(t);
    const request = () => api(t).post("/api/auth/password-reset/request", { email: user.email });
    const responses = await Promise.all([request(), request()]);
    expect(responses.map((res) => [res.status, res.body.code])).toEqual([[202, undefined], [202, undefined]]);
    await t.flushMail();
    await advance(2 * MINUTE);
    // One delivery per request; whichever got sent left once, under its own Message-ID. (The first
    // may have been superseded by the second, even in flight: its link is dead either way.)
    await advance(DAY_MS);
    const rows = await deliveries("PASSWORD_RESET");
    expect(rows).toHaveLength(2);
    expect(rows.at(-1)).toMatchObject({ status: "SENT" });
    const sent = t.mailer.messagesFor(user.email);
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent.length).toBeLessThanOrEqual(2);
    expect(new Set(sent.map((mail) => mail.messageId)).size).toBe(sent.length);
    expect(sent.every((mail) => rows.some((row) => mail.messageId?.startsWith(`<${row.id}.`)))).toBe(true);
    expect(sent.filter((mail) => mail.messageId!.startsWith(`<${rows.at(-1)!.id}.`))).toHaveLength(1);
  });

  it("017/US1-5 um pedido novo do mesmo tipo substitui o pendente: só o link novo chega", async () => {
    const user = await createUser(t);
    t.mailer.setFailing(true);
    for (let i = 0; i < 2; i += 1) {
      await api(t).post("/api/auth/password-reset/request", { email: user.email });
      await t.flushMail();
    }
    expect((await deliveries("PASSWORD_RESET")).map((row) => row.status)).toEqual(["SUPERSEDED", "PENDING"]);
    const oldTokens = t.mailer.failed.map((mail) => tokenIn(mail.text));
    t.mailer.setFailing(false);
    expect(await advance(2 * MINUTE)).toBe(1);
    expect(t.mailer.messagesFor(user.email)).toHaveLength(1);
    for (const token of oldTokens) expect(await kinds[1]!.works(token)).toBe(false);
    expect(await kinds[1]!.works(t.mailer.lastTokenFor(user.email, "password-reset")!)).toBe(true);
  });

  it("017/US1-6 a redefinição de um e-mail que não existe não agenda nada", async () => {
    expect((await api(t).post("/api/auth/password-reset/request", { email: uniqueEmail("ninguem") })).status).toBe(202);
    await t.flushMail();
    expect(await t.prisma.mailDelivery.count()).toBe(0);
  });

  it("017/US1-7 o professor vê a mesma situação do convite de turma, e a nova tentativa não muda prazo nem contagem (003 FR-015)", async () => {
    t.mailer.setFailing(true);
    const { subjectId } = await kinds[4]!.request();
    await t.flushMail();
    const before = await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: subjectId } });
    const cookie = await loginAs(t, teacher);
    const list = async () => (await api(t, { cookie }).get(`/api/classes/${before.classId}/invitations`)).body.items[0];
    expect(await list()).toMatchObject({ delivery: "SENDING", deliveryIssue: null });

    t.mailer.setFailing(false);
    await advance(2 * MINUTE);
    expect(await list()).toMatchObject({ delivery: "SENT", deliveryIssue: null, sendCount: 1 });
    const after = await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: subjectId } });
    expect([after.expiresAt, after.sendCount, after.lastSentAt]).toEqual([before.expiresAt, before.sendCount, before.lastSentAt]);
  });

  it("017/FR-001 operação desfeita → nenhum envio", async () => {
    const user = await createUser(t);
    await expect(
      t.prisma.runInTransaction(async (tx) => {
        await t.get(MailOutbox).schedule(tx, "PASSWORD_RESET", user.id);
        throw new Error("a operação falhou depois de agendar");
      }),
    ).rejects.toThrow("a operação falhou");
    expect(await t.prisma.mailDelivery.count()).toBe(0);
  });

  it("017/FR-004 recusa permanente (5xx) → UNDELIVERED (REJECTED) auditado, sem nova tentativa", async () => {
    t.mailer.failNext(1, "permanent");
    const { email } = await kinds[4]!.request();
    await t.flushMail();
    const [delivery] = await deliveries("CLASS_INVITATION");
    expect(delivery).toMatchObject({ status: "UNDELIVERED", undeliveredReason: "REJECTED", attempts: 1, nextAttemptAt: null, lastErrorCode: "EENVELOPE" });
    expect(await advance(DAY_MS)).toBe(0);
    expect(t.mailer.messagesFor(email)).toHaveLength(0);
    expect((await auditOf("mail_delivery.undelivered")).map((event) => event.metadata)).toEqual([
      { kind: "CLASS_INVITATION", reason: "REJECTED", source: "SMTP" },
    ]);
  });

  it("017/FR-009 nenhuma coluna da fila guarda endereço, nome, link, token ou hash", async () => {
    t.mailer.failNext(6);
    for (const kase of kinds) await kase.request();
    await t.flushMail();
    await advance(2 * MINUTE);
    await t.flushMail();
    const mails = [...t.mailer.failed, ...t.mailer.outbox];
    expect(mails.length).toBeGreaterThanOrEqual(12);
    const tokens = mails.map((mail) => tokenIn(mail.text));
    const secrets = [
      ...mails.map((mail) => mail.to),
      ...tokens,
      ...tokens.map(hashToken),
      "Professora Ada",
      "Gestora",
      "token=",
      "http://",
    ];
    const rows = JSON.stringify(await t.prisma.mailDelivery.findMany());
    for (const secret of secrets) expect(rows).not.toContain(secret);
  });

  it("017/SC-001 com o servidor fora por 6 h, todos os e-mails pedidos saem depois, um por envio", async () => {
    t.mailer.setFailing(true);
    const recipients = [];
    for (const kase of kinds.slice(0, 5)) recipients.push((await kase.request()).email);
    await t.flushMail();
    for (let elapsed = 0; elapsed < 6 * HOUR; elapsed += 30 * MINUTE) await advance(30 * MINUTE);
    expect((await deliveries()).every((row) => row.status === "PENDING")).toBe(true);

    t.mailer.setFailing(false);
    for (let i = 0; i < 4; i += 1) await advance(3 * HOUR);
    const rows = await deliveries();
    expect(rows.map((row) => row.status)).toEqual(rows.map(() => "SENT"));
    for (const email of recipients) expect(t.mailer.messagesFor(email)).toHaveLength(1);
  });
});

const DAY_MS = 24 * HOUR;

/**
 * 017/FR-008: `MAIL_SENDS_PER_MINUTE` caps the sends of every instance in a minute of the server
 * clock (first attempts and worker together); `0` pauses sending without losing anything.
 */
describe("017/FR-008 limite de envios por minuto", () => {
  const clock = new FixedClock(new Date());
  let t: TestApp;

  afterAll(() => t?.close());

  it("017/FR-008 200 convites de turma num minuto com limite 120: no máximo 120 saem nesse minuto, o restante sai no worker", async () => {
    t = await createTestApp({
      clock,
      config: {
        mail: { ...testConfig().mail, sendsPerMinute: 120 },
        rateLimit: { ...testConfig().rateLimit, classInviteTeacherHourly: 1000 },
      },
    });
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const schoolClass = await createClass(t, teacher.id);
    const client = api(t, { cookie: await loginAs(t, teacher) });
    for (let batch = 0; batch < 10; batch += 1) {
      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, i) => client.post(`/api/classes/${schoolClass.id}/invitations`, { email: `aluno-${batch}-${i}@limite.test` })),
      );
      expect(responses.map((res) => res.status)).toEqual(responses.map(() => 201));
    }
    await t.flushMail();
    expect(t.mailer.outbox).toHaveLength(120);

    const worker = t.get(MailDeliveryWorker);
    // The minute is spent: the worker, due rows or not, sends nothing more in it.
    clock.advance(59_000);
    expect(await worker.runOnce(clock.now())).toBe(0);

    let minutes = 0;
    while ((await t.prisma.mailDelivery.count({ where: { status: "PENDING" } })) > 0 && minutes < 10) {
      clock.advance(MINUTE);
      minutes += 1;
      const before = t.mailer.outbox.length;
      for (let cycle = 0; cycle < 4; cycle += 1) await worker.runOnce(clock.now());
      expect(t.mailer.outbox.length - before).toBeLessThanOrEqual(120);
    }
    expect(await t.prisma.mailDelivery.count({ where: { status: "SENT" } })).toBe(200);
    expect(t.mailer.outbox).toHaveLength(200);
    await t.close();
  });

  it("017/FR-008 com 0 nem a primeira tentativa sai, e nada se perde", async () => {
    t = await createTestApp({ clock, config: { mail: { ...testConfig().mail, sendsPerMinute: 0 } } });
    await resetDb(t.prisma);
    const user = await createUser(t);
    expect((await api(t).post("/api/auth/password-reset/request", { email: user.email })).status).toBe(202);
    await t.flushMail();
    clock.advance(DAY_MS);
    expect(await t.get(MailDeliveryWorker).runOnce(clock.now())).toBe(0);
    expect(t.mailer.outbox).toHaveLength(0);
    expect(await t.prisma.mailDelivery.findFirstOrThrow()).toMatchObject({ status: "PENDING", attempts: 0 });
  });
});
