import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AttemptIntegrityEventType, WorkHelpStatus } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow, createClassWithStudents, type CreatedActivity } from "../helpers/activities";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 015 data-model.md, research F2, F4, F11: the database refuses, by itself, what the controlled mode
 * and the AI help forbid — rows written by Prisma or SQL, without the API or its contracts in the way
 * (constitution V).
 */
describe("015/FR-002 015/FR-005 015/FR-010 015/FR-020 regras do modo controlado e da ajuda garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacherId: string;
  let student: TestUser;
  let other: TestUser;
  let schoolClass: { id: string; teacherId: string };
  /** CONTROLLED, allowance 3: multiple choice, open answer, code. */
  let controlled: CreatedActivity;
  /** NORMAL, allowance 0. */
  let normal: CreatedActivity;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    const created = await createClassWithStudents(t, teacherId, { students: 2 });
    schoolClass = created.schoolClass;
    [student, other] = created.students as [TestUser, TestUser];
    controlled = await createActivity(t, schoolClass, {
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      questions: [{ type: "MULTIPLE_CHOICE" }, { type: "OPEN_ANSWER" }, { type: "CODE" }],
    });
    normal = await createActivity(t, schoolClass);
  });

  const attempt = (activity: CreatedActivity, who = student) => createAttemptRow(t, activity.activity.id, who.id).then((row) => row.attemptId);
  const submit = (attemptId: string) => t.prisma.activityAttempt.update({ where: { id: attemptId }, data: { status: "SUBMITTED" } });

  /** An integrity event of `attemptId`; a valid unbuffered SCREEN_LEFT unless overridden. */
  const event = (
    attemptId: string,
    fields: { type?: AttemptIntegrityEventType; questionId?: string | null; buffered?: boolean; clientOccurredAt?: Date | null; clientEventId?: string } = {},
    activity = controlled,
    who = student,
  ) =>
    t.prisma.attemptIntegrityEvent.create({
      data: {
        attemptId,
        activityId: activity.activity.id,
        studentUserId: who.id,
        clientEventId: fields.clientEventId ?? randomUUID(),
        type: fields.type ?? "SCREEN_LEFT",
        questionId: fields.questionId ?? null,
        recordedAt: new Date(),
        buffered: fields.buffered ?? false,
        clientOccurredAt: fields.clientOccurredAt === undefined ? null : fields.clientOccurredAt,
      },
    });

  /** A help request of `attemptId` on question 0; a valid REQUESTED unless overridden. */
  const help = (
    attemptId: string,
    fields: {
      status?: WorkHelpStatus;
      message?: string | null;
      exampleCode?: string | null;
      reasonCode?: string | null;
      question?: string;
      resolvedAt?: Date | null;
      idempotencyKey?: string;
    } = {},
    activity = controlled,
    who = student,
  ) => {
    const status = fields.status ?? "REQUESTED";
    return t.prisma.workHelpRequest.create({
      data: {
        attemptId,
        activityId: activity.activity.id,
        studentUserId: who.id,
        questionId: activity.questionIds[0]!,
        idempotencyKey: fields.idempotencyKey ?? randomUUID(),
        question: fields.question ?? "Como eu começo?",
        status,
        message: fields.message === undefined ? (status === "DELIVERED" || status === "OUT_OF_SCOPE" ? "Pense no conceito." : null) : fields.message,
        exampleCode: fields.exampleCode ?? null,
        reasonCode:
          fields.reasonCode === undefined ? (status === "BLOCKED" ? "SOLUTION_OVERLAP" : status === "FAILED" ? "AI_PROVIDER_ERROR" : null) : fields.reasonCode,
        requestedAt: new Date(),
        resolvedAt: fields.resolvedAt === undefined ? (status === "REQUESTED" ? null : new Date()) : fields.resolvedAt,
      },
    });
  };

  describe("modo e franquia da atividade (research F2)", () => {
    it("015/FR-002 só Trabalho tem modo controlado e ajuda; a franquia é 0 ou 3", async () => {
      const exercise = await createActivity(t, schoolClass, { type: "EXERCISE" });
      await expect(t.prisma.classActivity.update({ where: { id: exercise.activity.id }, data: { executionMode: "CONTROLLED" } })).rejects.toThrow(
        /execution_mode_chk/,
      );
      await expect(t.prisma.classActivity.update({ where: { id: exercise.activity.id }, data: { aiHelpAllowance: 3 } })).rejects.toThrow(
        /ai_help_allowance_chk/,
      );
      for (const allowance of [1, 2, 4, -1]) {
        await expect(t.prisma.classActivity.update({ where: { id: normal.activity.id }, data: { aiHelpAllowance: allowance } }), `${allowance}`).rejects.toThrow(
          /ai_help_allowance_chk/,
        );
      }
      const stored = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: normal.activity.id } });
      expect([stored.executionMode, stored.aiHelpAllowance]).toEqual(["NORMAL", 0]);
    });

    it("015/FR-005 modo e franquia mudam enquanto ninguém iniciou e ficam fixos depois da primeira tentativa", async () => {
      const id = normal.activity.id;
      await t.prisma.classActivity.update({ where: { id }, data: { executionMode: "CONTROLLED", aiHelpAllowance: 3 } });
      await t.prisma.classActivity.update({ where: { id }, data: { executionMode: "NORMAL", aiHelpAllowance: 0 } });
      await attempt(normal);
      await expect(t.prisma.classActivity.update({ where: { id }, data: { executionMode: "CONTROLLED" } })).rejects.toThrow(/fixed once a student started/);
      await expect(t.prisma.classActivity.update({ where: { id }, data: { aiHelpAllowance: 3 } })).rejects.toThrow(/fixed once a student started/);
      await expect(t.prisma.classActivity.update({ where: { id }, data: { title: "Outro título" } })).resolves.toBeTruthy();
      await expect(t.prisma.classActivity.update({ where: { id }, data: { type: "EXERCISE" } })).rejects.toThrow(/immutable/);
    });
  });

  describe("eventos da tentativa controlada (research F4)", () => {
    it("015/FR-010 eventos só em tentativa em andamento de atividade controlada", async () => {
      const open = await attempt(controlled);
      await expect(event(open)).resolves.toBeTruthy();
      const normalAttempt = await attempt(normal);
      await expect(event(normalAttempt, {}, normal)).rejects.toThrow(/not of a controlled activity/);
      await submit(open);
      await expect(event(open)).rejects.toThrow(/not in progress/);
    });

    it("015/FR-010 eventos não mudam nem são apagados; o mesmo id do cliente grava uma vez só", async () => {
      const open = await attempt(controlled);
      const clientEventId = randomUUID();
      const created = await event(open, { clientEventId });
      await expect(event(open, { clientEventId })).rejects.toThrow(/Unique constraint|unique/i);
      await expect(event(await attempt(controlled, other), { clientEventId }, controlled, other)).resolves.toBeTruthy();
      await expect(t.prisma.attemptIntegrityEvent.update({ where: { id: created.id }, data: { type: "SCREEN_RETURNED" } })).rejects.toThrow(/append-only/);
      await expect(t.prisma.attemptIntegrityEvent.delete({ where: { id: created.id } })).rejects.toThrow(/append-only/);
    });

    it("015/FR-010 horário do navegador só no evento bufferizado; questão só em cópia/colagem e limite de digitação", async () => {
      const open = await attempt(controlled);
      await expect(event(open, { buffered: true, clientOccurredAt: new Date() })).resolves.toBeTruthy();
      await expect(event(open, { buffered: true })).rejects.toThrow(/buffered_chk/);
      await expect(event(open, { buffered: false, clientOccurredAt: new Date() })).rejects.toThrow(/buffered_chk/);
      await expect(event(open, { type: "PASTE_BLOCKED", questionId: controlled.questionIds[1]! })).resolves.toBeTruthy();
      await expect(event(open, { type: "PASTE_BLOCKED" })).resolves.toBeTruthy();
      await expect(event(open, { type: "SCREEN_LEFT", questionId: controlled.questionIds[1]! })).rejects.toThrow(/question_chk/);
      await expect(event(open, { type: "TYPING_LIMIT_EXCEEDED" })).rejects.toThrow(/question_chk/);
      await expect(event(open, { type: "TYPING_LIMIT_EXCEEDED", questionId: controlled.questionIds[2]! })).resolves.toBeTruthy();
      await expect(event(open, { type: "COPY_BLOCKED", questionId: normal.questionIds[0]! })).rejects.toThrow(/foreign key|Foreign key/i);
    });

    it("015/FR-010 o evento é da tentativa daquele aluno e daquela atividade", async () => {
      const open = await attempt(controlled);
      await expect(event(open, {}, controlled, other)).rejects.toThrow(/foreign key|Foreign key/i);
    });
  });

  describe("pedidos de ajuda (research F11)", () => {
    it("015/FR-020 um pedido pendente por tentativa; outra tentativa tem o seu", async () => {
      const open = await attempt(controlled);
      await help(open);
      await expect(help(open)).rejects.toThrow(/Unique constraint|unique/i);
      await expect(help(await attempt(controlled, other), {}, controlled, other)).resolves.toBeTruthy();
      await expect(help(open, { status: "OUT_OF_SCOPE" })).resolves.toBeTruthy();
    });

    it("015/FR-016 a mesma chave de idempotência grava um pedido só por tentativa", async () => {
      const open = await attempt(controlled);
      const idempotencyKey = randomUUID();
      await help(open, { idempotencyKey, status: "FAILED" });
      await expect(help(open, { idempotencyKey })).rejects.toThrow(/Unique constraint|unique/i);
    });

    it("015/FR-020 status terminal é final; o pedido não muda nem é apagado", async () => {
      const open = await attempt(controlled);
      const pending = await help(open);
      await t.prisma.workHelpRequest.update({ where: { id: pending.id }, data: { status: "DELIVERED", message: "Pense no laço.", resolvedAt: new Date() } });
      await expect(
        t.prisma.workHelpRequest.update({ where: { id: pending.id }, data: { status: "FAILED", message: null, reasonCode: "AI_TIMEOUT" } }),
      ).rejects.toThrow(/final/);
      await expect(t.prisma.workHelpRequest.update({ where: { id: pending.id }, data: { message: "Outra" } })).rejects.toThrow(/final/);
      const other = await help(open);
      await expect(t.prisma.workHelpRequest.update({ where: { id: other.id }, data: { question: "Outra pergunta" } })).rejects.toThrow(/immutable/);
      await expect(t.prisma.workHelpRequest.delete({ where: { id: other.id } })).rejects.toThrow(/cannot be deleted/);
    });

    it("015/FR-020 os campos seguem o status", async () => {
      const open = await attempt(controlled);
      const invalid: Parameters<typeof help>[1][] = [
        { status: "REQUESTED", message: "x" },
        { status: "REQUESTED", resolvedAt: new Date() },
        { status: "DELIVERED", message: null },
        { status: "DELIVERED", resolvedAt: null },
        { status: "DELIVERED", reasonCode: "SOLUTION_OVERLAP" },
        { status: "OUT_OF_SCOPE", exampleCode: "int x;" },
        { status: "BLOCKED", message: "x" },
        { status: "BLOCKED", reasonCode: "OUTRO" },
        { status: "BLOCKED", reasonCode: null },
        { status: "FAILED", reasonCode: null },
        { status: "FAILED", message: "x" },
      ];
      for (const fields of invalid) {
        await expect(help(open, fields), JSON.stringify(fields)).rejects.toThrow(/status_chk/);
      }
      for (const status of ["DELIVERED", "OUT_OF_SCOPE", "BLOCKED", "FAILED"] as const) {
        await expect(help(open, { status }), status).resolves.toBeTruthy();
      }
      await expect(help(open, { status: "DELIVERED", exampleCode: "for (int i = 0; i < n; i++) {}" })).resolves.toBeTruthy();
    });

    it("015/FR-016 tamanhos: pergunta 1–500, orientação ≤ 2 000, exemplo ≤ 1 500", async () => {
      const open = await attempt(controlled);
      await expect(help(open, { status: "FAILED", question: "" })).rejects.toThrow(/size_chk/);
      await expect(help(open, { status: "FAILED", question: "x".repeat(501) })).rejects.toThrow(/size_chk/);
      await expect(help(open, { status: "FAILED", question: "x".repeat(500) })).resolves.toBeTruthy();
      await expect(help(open, { status: "DELIVERED", message: "x".repeat(2001) })).rejects.toThrow(/size_chk/);
      await expect(help(open, { status: "DELIVERED", message: "x".repeat(2000), exampleCode: "y".repeat(1500) })).resolves.toBeTruthy();
      await expect(help(open, { status: "DELIVERED", exampleCode: "y".repeat(1501) })).rejects.toThrow(/size_chk/);
    });

    it("015/FR-003 015/FR-020 no máximo 3 entregues por tentativa, e só com franquia 3 (no commit)", async () => {
      const open = await attempt(controlled);
      for (let index = 0; index < 3; index++) await help(open, { status: "DELIVERED" });
      await expect(help(open, { status: "DELIVERED" })).rejects.toThrow(/more than 3/);
      await expect(help(open, { status: "OUT_OF_SCOPE" })).resolves.toBeTruthy();
      const pending = await help(open);
      await expect(
        t.prisma.workHelpRequest.update({ where: { id: pending.id }, data: { status: "DELIVERED", message: "x", resolvedAt: new Date() } }),
      ).rejects.toThrow(/more than 3/);

      const withoutHelp = await createActivity(t, schoolClass, { executionMode: "CONTROLLED" });
      await expect(help(await attempt(withoutHelp), {}, withoutHelp)).rejects.toThrow(/does not allow AI help/);
    });
  });
});
