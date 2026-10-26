import { randomUUID } from "node:crypto";
import { StudentFeedbackPageSchema, StudentFeedbackSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents } from "../helpers/activities";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { sendFeedback } from "../helpers/feedback";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** 020/US3 — the student follows their own feedbacks (contracts/http-api.md, research J6, J7). */
describe("020/US3 aluno acompanha os próprios feedbacks", () => {
  let t: TestApp;
  let clock: FixedClock;
  let admin: TestUser;
  let adminClient: ReturnType<typeof api>;
  let ana: TestUser;
  let bruno: TestUser;
  let anaClient: ReturnType<typeof api>;
  let brunoClient: ReturnType<typeof api>;

  beforeAll(async () => {
    clock = new FixedClock("2026-10-25T12:00:00.000Z");
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set("2026-10-25T12:00:00.000Z");
    admin = await createUser(t, { roles: ["ADMIN"], name: "Admin Um" });
    adminClient = api(t, { cookie: await loginAs(t, admin) });
    ana = await createUser(t, { roles: ["STUDENT"], name: "Ana Souza" });
    bruno = await createUser(t, { roles: ["STUDENT"], name: "Bruno Lima" });
    anaClient = api(t, { cookie: await loginAs(t, ana) });
    brunoClient = api(t, { cookie: await loginAs(t, bruno) });
  });

  /** Sends a feedback at the clock's time, then moves the clock one minute ahead. */
  const send = async (client: ReturnType<typeof api>, overrides: Record<string, unknown> = {}) => {
    const res = await sendFeedback(client, overrides);
    expect(res.status).toBe(201);
    clock.advance(MINUTE);
    return res.body.id as string;
  };

  const mine = async (client: ReturnType<typeof api>, query = "") => {
    const res = await client.get(`/api/me/feedbacks${query}`);
    expect(res.status).toBe(200);
    return StudentFeedbackPageSchema.parse(res.body);
  };

  it("020/US3-1 vê só os próprios feedbacks, mais recentes primeiro, com categoria, data, texto e situação", async () => {
    const first = await send(anaClient, { category: "PROBLEM", message: "A página travou ao salvar a resposta." });
    await send(brunoClient);
    const second = await send(anaClient, { category: "PRAISE", message: "O editor de código ajudou muito." });

    const page = await mine(anaClient);
    expect(page).toEqual({
      items: [
        { id: second, category: "PRAISE", message: "O editor de código ajudou muito.", status: "RECEIVED", createdAt: "2026-10-25T12:02:00.000Z" },
        { id: first, category: "PROBLEM", message: "A página travou ao salvar a resposta.", status: "RECEIVED", createdAt: "2026-10-25T12:00:00.000Z" },
      ],
      nextCursor: null,
    });
  });

  it("020/US3-1 páginas de 50 com nextCursor; cursor inválido ou campo extra → 400", async () => {
    const base = new Date("2026-10-01T00:00:00.000Z").getTime();
    await t.prisma.studentFeedback.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        studentId: ana.id,
        submissionId: randomUUID(),
        category: "OTHER" as const,
        message: `Feedback número ${i} do teste.`,
        createdAt: new Date(base + i * MINUTE),
        statusChangedAt: new Date(base + i * MINUTE),
      })),
    });
    const first = await mine(anaClient);
    expect(first.items).toHaveLength(50);
    expect(first.items[0]!.message).toBe("Feedback número 50 do teste.");
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await mine(anaClient, `?cursor=${first.nextCursor}`);
    expect(second.items.map((item) => item.message)).toEqual(["Feedback número 0 do teste."]);
    expect(second.nextCursor).toBeNull();
    expect((await anaClient.get("/api/me/feedbacks?cursor=nao-e-um-cursor")).status).toBe(400);
    expect((await anaClient.get("/api/me/feedbacks?status=RECEIVED")).status).toBe(400);
  });

  it("020/US3-1 um aluno removido de todas as turmas também vê os seus (spec Edge Cases)", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const { students } = await createClassWithStudents(t, teacher.id, { students: 1 });
    const removed = students[0]!;
    const removedClient = api(t, { cookie: await loginAs(t, removed) });
    const id = await send(removedClient);
    await t.prisma.enrollment.updateMany({ where: { studentUserId: removed.id }, data: { status: "REMOVED", removedAt: new Date(), removedById: teacher.id } });
    expect((await mine(removedClient)).items.map((item) => item.id)).toEqual([id]);
  });

  it("020/US3-2 a situação RESOLVED aparece sem histórico, ADMIN, originPath, statusChangedAt ou submissionId", async () => {
    const id = await send(anaClient, { originPath: "/minhas-atividades/abc-1" });
    expect((await adminClient.post(`/api/feedbacks/${id}/status`, { status: "IN_REVIEW" })).status).toBe(200);
    expect((await adminClient.post(`/api/feedbacks/${id}/status`, { status: "RESOLVED" })).status).toBe(200);

    const res = await anaClient.get("/api/me/feedbacks");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const item = res.body.items[0];
    expect(item.status).toBe("RESOLVED");
    expect(Object.keys(item).sort()).toEqual(Object.keys(StudentFeedbackSchema.shape).sort());
    expect(Object.keys(res.body).sort()).toEqual(["items", "nextCursor"]);
    const raw = JSON.stringify(res.body);
    for (const absent of ["Admin Um", admin.id, "/minhas-atividades", "history", "statusChangedAt", "submissionId", "originPath"]) {
      expect(raw).not.toContain(absent);
    }
  });

  it("020/US3-3 dois alunos: cada um vê só os seus; nenhuma rota do aluno aceita o id de um feedback", async () => {
    const anaId = await send(anaClient);
    const brunoId = await send(brunoClient);
    expect((await mine(anaClient)).items.map((item) => item.id)).toEqual([anaId]);
    expect((await mine(brunoClient)).items.map((item) => item.id)).toEqual([brunoId]);

    // The student has no detail route: the other's id answers as nonexistent, like any id.
    for (const id of [brunoId, anaId, randomUUID()]) {
      expect((await anaClient.get(`/api/me/feedbacks/${id}`)).status).toBe(404);
      expect((await anaClient.get(`/api/feedbacks/${id}`)).status).toBe(403);
    }
    expect((await anaClient.get("/api/feedbacks")).status).toBe(403);
  });

  it("020/US3-3 sem sessão → 401; professor sem feedbacks.proprios.listar → 403", async () => {
    expect((await api(t).get("/api/me/feedbacks")).status).toBe(401);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    expect((await api(t, { cookie: await loginAs(t, teacher) }).get("/api/me/feedbacks")).status).toBe(403);
  });
});
