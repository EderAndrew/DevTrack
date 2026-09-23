import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createClass, createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const CLASSES = 100;
const STUDENTS = 200;
const LIMIT_MS = 1000;

/**
 * 003/SC-008: the lists of classes, students and invitations answer within 1 s for a teacher
 * with 100 classes and a class with 200 students (and 200 invitations). Each route is warmed
 * once, then the slowest of three calls is measured end to end through HTTP.
 */
describe("003/SC-008 — listas de turmas, alunos e convites em até 1 s", () => {
  let t: TestApp;
  let client: ReturnType<typeof api>;
  let big: SchoolClass;
  let studentCookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    const classes: SchoolClass[] = [];
    for (let i = 0; i < CLASSES; i += 1) {
      classes.push(await createClass(t, teacher.id, { name: `Turma ${String(i).padStart(3, "0")}`, code: `T-${i}` }));
    }
    big = classes[0]!;

    const { passwordHash } = await t.prisma.user.findUniqueOrThrow({ where: { id: teacher.id } });
    // One real student (role and profile through the factory); the other 199 are bulk rows.
    const first = await createUser(t, { name: "Aluno 000", ra: "RA-0000" });
    const users = Array.from({ length: STUDENTS - 1 }, (_, i) => ({
      id: randomUUID(),
      email: `aluno-${i + 1}@example.test`,
      name: `Aluno ${String(i + 1).padStart(3, "0")}`,
      passwordHash,
      emailVerifiedAt: new Date(),
    }));
    await t.prisma.user.createMany({ data: users });
    await t.prisma.studentProfile.createMany({
      data: users.map((u, i) => ({ userId: u.id, displayName: u.name, ra: `RA-${String(i + 1).padStart(4, "0")}` })),
    });
    await t.prisma.enrollment.createMany({
      data: [first.id, ...users.map((u) => u.id)].map((studentUserId) => ({
        classId: big.id,
        studentUserId,
        status: "ACTIVE" as const,
        enrolledAt: new Date(),
      })),
    });
    // The first student is in every class, so "Minhas turmas" also lists 100.
    await t.prisma.enrollment.createMany({
      data: classes.slice(1).map((c) => ({ classId: c.id, studentUserId: first.id, status: "ACTIVE" as const, enrolledAt: new Date() })),
    });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await t.prisma.classInvitation.createMany({
      data: Array.from({ length: STUDENTS }, (_, i) => ({
        classId: big.id,
        email: `convidado-${i}@example.test`,
        tokenHash: randomUUID(),
        status: "PENDING" as const,
        expiresAt,
        lastSentAt: new Date(),
        invitedById: teacher.id,
      })),
    });

    client = api(t, { cookie: await loginAs(t, teacher) });
    studentCookie = await loginAs(t, first);
  }, 120_000);
  afterAll(() => t.close());

  const slowest = async (call: () => Promise<{ status: number }>) => {
    expect((await call()).status).toBe(200);
    let worst = 0;
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      const res = await call();
      worst = Math.max(worst, performance.now() - start);
      expect(res.status).toBe(200);
    }
    return worst;
  };

  it.each([
    ["turmas do professor", () => client.get("/api/classes")],
    ["turmas do professor com pesquisa e filtro", () => client.get("/api/classes?query=turma%2009&year=2026")],
    ["alunos da turma", () => client.get(`/api/classes/${big.id}/enrollments`)],
    ["alunos da turma com pesquisa", () => client.get(`/api/classes/${big.id}/enrollments?query=aluno%2019`)],
    ["convites da turma", () => client.get(`/api/classes/${big.id}/invitations`)],
    ["convites da turma com pesquisa", () => client.get(`/api/classes/${big.id}/invitations?query=convidado-19`)],
    ["detalhe da turma", () => client.get(`/api/classes/${big.id}`)],
    ["minhas turmas do aluno", () => api(t, { cookie: studentCookie }).get("/api/me/classes")],
  ] as const)("%s ≤ 1 s", async (_name, call) => {
    expect(await slowest(call)).toBeLessThanOrEqual(LIMIT_MS);
  });
});
