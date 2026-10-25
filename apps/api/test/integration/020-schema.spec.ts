import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Prisma, StudentFeedbackStatus } from "../../src/generated/prisma/client";
import { createUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 020 data-model.md, research J2, J5, J8: the database refuses, by itself, what the feedback rules
 * forbid — rows written by Prisma, without the API in the way (constitution V).
 */
describe("020/FR-006 020/FR-007 020/FR-012 regras do feedback dos alunos garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let studentId: string;
  let adminId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    studentId = (await createUser(t, { roles: ["STUDENT"] })).id;
    adminId = (await createUser(t, { roles: ["ADMIN"] })).id;
  });

  const create = (fields: Partial<Prisma.StudentFeedbackUncheckedCreateInput> = {}) =>
    t.prisma.studentFeedback.create({
      data: { studentId, submissionId: randomUUID(), category: "PROBLEM", message: "A página travou ao salvar.", ...fields },
    });
  /** A feedback already at `status` (inserted directly: the trigger only watches updates). */
  const at = (status: StudentFeedbackStatus) => create({ status });
  const update = (id: string, data: Prisma.StudentFeedbackUncheckedUpdateInput) => t.prisma.studentFeedback.update({ where: { id }, data });
  const change = (feedbackId: string, fromStatus: StudentFeedbackStatus, toStatus: StudentFeedbackStatus) =>
    t.prisma.studentFeedbackStatusChange.create({ data: { feedbackId, fromStatus, toStatus, changedById: adminId } });
  const purging = <T>(operation: Prisma.PrismaPromise<T>) =>
    t.prisma.$transaction([t.prisma.$executeRawUnsafe("SET LOCAL devtrack.feedback_purge = 'on'"), operation]);

  describe("student_feedbacks: CHECKs, UNIQUE e padrão", () => {
    it("020/FR-001 a mensagem tem 10–2 000 caracteres contados em code points (emoji conta 1)", async () => {
      await expect(create({ message: "😀".repeat(10) })).resolves.toBeDefined();
      await expect(create({ message: "😀".repeat(2000) })).resolves.toBeDefined();
      await expect(create({ message: "😀".repeat(9) })).rejects.toThrow();
      await expect(create({ message: "ç".repeat(2001) })).rejects.toThrow();
    });

    it("020/FR-002 a tela de origem é só um caminho do portal (research J2)", async () => {
      for (const originPath of [null, "/painel", "/", "/minhas-atividades/0f3a-1_b.c", "/a/..b", `/${"a".repeat(199)}`]) {
        await expect(create({ originPath }), String(originPath)).resolves.toBeDefined();
      }
      const refused = ["painel", "/painel?token=abc", "/com espaco", "/a#b", "/a%20b", `/${"a".repeat(200)}`, "//evil.example/x", "/..", "/a/../b", "/a/.."];
      for (const originPath of refused) {
        await expect(create({ originPath }), originPath).rejects.toThrow();
      }
    });

    it("020/FR-004 o mesmo submission_id do mesmo aluno é recusado; de outro aluno é aceito", async () => {
      const submissionId = randomUUID();
      await create({ submissionId });
      await expect(create({ submissionId })).rejects.toThrow();
      const other = await createUser(t, { roles: ["STUDENT"] });
      await expect(create({ submissionId, studentId: other.id })).resolves.toBeDefined();
    });

    it("020/FR-002 um feedback nasce RECEIVED, com created_at e status_changed_at do servidor", async () => {
      const row = await create();
      expect(row.status).toBe("RECEIVED");
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.statusChangedAt).toBeInstanceOf(Date);
    });
  });

  describe("student_feedbacks: gatilho de UPDATE", () => {
    it("020/FR-012 categoria, mensagem, tela, aluno, submission_id e created_at são imutáveis", async () => {
      const row = await create();
      const other = await createUser(t, { roles: ["STUDENT"] });
      const changes: Prisma.StudentFeedbackUncheckedUpdateInput[] = [
        { category: "PRAISE" },
        { message: "Outro texto qualquer." },
        { originPath: "/outra" },
        { studentId: other.id },
        { submissionId: randomUUID() },
        { createdAt: new Date(Date.now() - 60_000) },
      ];
      for (const data of changes) {
        await expect(update(row.id, data), JSON.stringify(data)).rejects.toThrow();
      }
    });

    const ALLOWED: [StudentFeedbackStatus, StudentFeedbackStatus][] = [
      ["RECEIVED", "IN_REVIEW"],
      ["RECEIVED", "RESOLVED"],
      ["RECEIVED", "ARCHIVED"],
      ["IN_REVIEW", "RESOLVED"],
      ["IN_REVIEW", "ARCHIVED"],
      ["RESOLVED", "IN_REVIEW"],
      ["ARCHIVED", "IN_REVIEW"],
    ];
    const STATUSES: StudentFeedbackStatus[] = ["RECEIVED", "IN_REVIEW", "RESOLVED", "ARCHIVED"];

    it("020/FR-006 cada transição do diagrama é aceita, com status_changed_at", async () => {
      for (const [from, to] of ALLOWED) {
        const row = await at(from);
        const changedAt = new Date(row.statusChangedAt.getTime() + 1000);
        await expect(update(row.id, { status: to, statusChangedAt: changedAt }), `${from} → ${to}`).resolves.toMatchObject({ status: to });
      }
    });

    it("020/FR-015 status_changed_at, a idade da retenção, nunca volta nem antecede o envio", async () => {
      const createdAt = new Date("2026-10-25T13:00:00.000Z");
      await expect(create({ createdAt, statusChangedAt: new Date(createdAt.getTime() - 1000) })).rejects.toThrow();
      const row = await create({ createdAt, statusChangedAt: createdAt });
      // A valid transition that moves the date back, and a date change without a status change.
      await expect(update(row.id, { status: "IN_REVIEW", statusChangedAt: new Date(createdAt.getTime() - 1000) })).rejects.toThrow();
      await expect(update(row.id, { statusChangedAt: new Date(createdAt.getTime() + 60_000) })).rejects.toThrow();
      // The same instant (a FixedClock) and a later one are accepted.
      await expect(update(row.id, { status: "IN_REVIEW", statusChangedAt: createdAt })).resolves.toMatchObject({ status: "IN_REVIEW" });
      await expect(update(row.id, { status: "RESOLVED", statusChangedAt: new Date(createdAt.getTime() + 1000) })).resolves.toMatchObject({
        status: "RESOLVED",
      });
    });

    it("020/FR-006 a mesma situação, a volta a RECEIVED e RESOLVED ↔ ARCHIVED direto são recusadas", async () => {
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          if (ALLOWED.some(([a, b]) => a === from && b === to)) continue;
          const row = await at(from);
          await expect(update(row.id, { status: to }), `${from} → ${to}`).rejects.toThrow();
        }
      }
    });
  });

  describe("apagar e o histórico", () => {
    it("020/FR-012 020/FR-015 o DELETE de um feedback é recusado fora da purga, que leva o histórico junto", async () => {
      const row = await at("IN_REVIEW");
      await change(row.id, "RECEIVED", "IN_REVIEW");
      await expect(t.prisma.studentFeedback.delete({ where: { id: row.id } })).rejects.toThrow();
      await purging(t.prisma.studentFeedback.delete({ where: { id: row.id } }));
      expect(await t.prisma.studentFeedback.count()).toBe(0);
      expect(await t.prisma.studentFeedbackStatusChange.count()).toBe(0);
    });

    it("020/FR-007 o histórico é só de acréscimo: UPDATE e DELETE recusados", async () => {
      const row = await at("IN_REVIEW");
      const history = await change(row.id, "RECEIVED", "IN_REVIEW");
      await expect(
        t.prisma.studentFeedbackStatusChange.update({ where: { id: history.id }, data: { toStatus: "RESOLVED" } }),
      ).rejects.toThrow();
      await expect(t.prisma.studentFeedbackStatusChange.delete({ where: { id: history.id } })).rejects.toThrow();
      expect(await t.prisma.studentFeedbackStatusChange.count()).toBe(1);
    });

    it("020/FR-006 o histórico recusa a mesma situação e a chegada em RECEIVED", async () => {
      const row = await at("IN_REVIEW");
      await expect(change(row.id, "IN_REVIEW", "IN_REVIEW")).rejects.toThrow();
      await expect(change(row.id, "IN_REVIEW", "RECEIVED")).rejects.toThrow();
      await expect(change(row.id, "RECEIVED", "IN_REVIEW")).resolves.toBeDefined();
    });
  });

  it("020/FR-011 as quatro permissões são semeadas só para STUDENT e ADMIN", async () => {
    const grants = await t.prisma.rolePermission.findMany({
      where: { permission: { key: { startsWith: "feedbacks." } } },
      select: { role: { select: { key: true } }, permission: { select: { key: true } } },
    });
    const byRole = (role: string) =>
      grants
        .filter((grant) => grant.role.key === role)
        .map((grant) => grant.permission.key)
        .sort();
    expect(byRole("STUDENT")).toEqual(["feedbacks.enviar", "feedbacks.proprios.listar"]);
    expect(byRole("ADMIN")).toEqual(["feedbacks.alterar_situacao", "feedbacks.visualizar"]);
    expect(byRole("TEACHER")).toEqual([]);
    expect(byRole("MANAGER")).toEqual([]);
  });
});
