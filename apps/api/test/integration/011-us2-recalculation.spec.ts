import type { UpdateWorkRequest, WorkTeacherView } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork, toUpdateBody } from "../helpers/works";

/**
 * 011/US2 — the values follow every edit: adding, removing or reordering questions and changing the
 * total grade rewrite them by position, in exact hundredths, adding up to the grade (011/FR-012,
 * research W4).
 */
describe("011/US2-4 011/FR-012 valores recalculados ao editar o trabalho", () => {
  let t: TestApp;
  let client: ReturnType<typeof api>;
  let work: WorkTeacherView;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    const created = await createWork(t, teacher.id, {
      status: "DRAFT",
      totalGrade: "0.50",
      questions: [
        { type: "OPEN_ANSWER", statement: "Primeira" },
        { type: "OPEN_ANSWER", statement: "Segunda" },
        { type: "OPEN_ANSWER", statement: "Terceira" },
      ],
    });
    work = (await client.get(`/api/works/${created.id}`))
      .body as WorkTeacherView;
    expect(work.questions.map((question) => question.value)).toEqual([
      "0.17",
      "0.17",
      "0.16",
    ]);
  });

  async function save(
    overrides: Partial<UpdateWorkRequest>,
  ): Promise<WorkTeacherView> {
    const res = await client.put(`/api/works/${work.id}`, {
      ...toUpdateBody(work),
      ...overrides,
    });
    expect(res.status).toBe(200);
    const view = res.body as WorkTeacherView;
    // What the database holds, not only what the view says.
    const rows = await t.prisma.workQuestion.findMany({
      where: { workId: work.id },
      orderBy: { position: "asc" },
    });
    expect(rows.map((row) => row.value.toFixed(2))).toEqual(
      view.questions.map((question) => question.value),
    );
    const sum = rows.reduce(
      (cents, row) => cents + Math.round(Number(row.value.toFixed(2)) * 100),
      0,
    );
    expect((sum / 100).toFixed(2)).toBe(view.totalGrade);
    return view;
  }

  const statements = (view: WorkTeacherView) =>
    view.questions.map((question) => question.statement);
  const values = (view: WorkTeacherView) =>
    view.questions.map((question) => question.value);

  it("acrescentar a 4ª → 0,13 · 0,13 · 0,12 · 0,12", async () => {
    const view = await save({
      questions: [
        ...toUpdateBody(work).questions,
        { type: "OPEN_ANSWER", statement: "Quarta", expectedAnswer: "R" },
      ],
    });
    expect(values(view)).toEqual(["0.13", "0.13", "0.12", "0.12"]);
    expect(view.questionCount).toBe(4);
  });

  it("remover uma → 0,25 · 0,25", async () => {
    const [first, , third] = toUpdateBody(work).questions;
    const view = await save({ questions: [first!, third!] });
    expect(statements(view)).toEqual(["Primeira", "Terceira"]);
    expect(values(view)).toEqual(["0.25", "0.25"]);
  });

  it("reordenar → o centésimo extra segue a posição, não a questão", async () => {
    const [first, second, third] = toUpdateBody(work).questions;
    const view = await save({ questions: [third!, first!, second!] });
    expect(statements(view)).toEqual(["Terceira", "Primeira", "Segunda"]);
    expect(values(view)).toEqual(["0.17", "0.17", "0.16"]);
    expect(view.questions[0]!.id).toBe(work.questions[2]!.id);
  });

  it("mudar a nota → 1,00 em 3: 0,34 · 0,33 · 0,33", async () => {
    const view = await save({ totalGrade: "1" });
    expect(view.totalGrade).toBe("1.00");
    expect(values(view)).toEqual(["0.34", "0.33", "0.33"]);
  });
});
