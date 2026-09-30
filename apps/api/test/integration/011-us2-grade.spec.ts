import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import {
  type ConfirmedSyllabus,
  createConfirmedSyllabus,
} from "../helpers/works";

/**
 * 011/US2 — the teacher gives only the total grade; the server writes each question's value in
 * exact hundredths, the first positions carrying the remainder, and the values always add up to
 * the total (011/FR-011, SC-004, research W3/W4). Grades travel as strings and are never rounded.
 */

const question = (n: number) => ({
  type: "OPEN_ANSWER" as const,
  statement: `Questão ${n}`,
  expectedAnswer: `Resposta ${n}`,
});

describe("011/US2 nota total e valor das questões com soma exata", () => {
  let t: TestApp;
  let teacher: TestUser;
  let client: ReturnType<typeof api>;
  let syllabus: ConfirmedSyllabus;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    syllabus = await createConfirmedSyllabus(t, teacher.id);
  });

  const create = (totalGrade: unknown, count: number) =>
    client.post("/api/works", {
      subjectId: syllabus.subject.id,
      title: "Trabalho de notas",
      totalGrade,
      topics: null,
      questions: Array.from({ length: count }, (_, index) =>
        question(index + 1),
      ),
      status: "DRAFT",
    });

  /** Values by position and their sum, both read from the database as text (no float on the way). */
  async function stored(workId: string) {
    const rows = await t.prisma.$queryRaw<{ value: string }[]>`
      SELECT value::text AS value FROM work_questions WHERE work_id = ${workId}::uuid ORDER BY position`;
    const [totals] = await t.prisma.$queryRaw<{ total: string; sum: string }[]>`
      SELECT w.total_grade::text AS total, SUM(q.value)::text AS sum
      FROM works w JOIN work_questions q ON q.work_id = w.id
      WHERE w.id = ${workId}::uuid GROUP BY w.total_grade`;
    return {
      values: rows.map((row) => row.value),
      total: totals!.total,
      sum: totals!.sum,
    };
  }

  it.each([
    ["011/US2-1", "0.50", 10, Array<string>(10).fill("0.05")],
    ["011/US2-2", "1.00", 10, Array<string>(10).fill("0.10")],
    ["011/US2-2", "0.50", 5, Array<string>(5).fill("0.10")],
    ["011/US2-3", "0.50", 3, ["0.17", "0.17", "0.16"]],
  ] as const)(
    "%s 011/SC-004 nota %s em %i questões: valores por posição e soma exata no banco",
    async (_id, totalGrade, count, expected) => {
      const res = await create(totalGrade, count);
      expect(res.status).toBe(201);

      // The teacher's view carries every grade as a two-decimal string (research W3).
      expect(res.body.totalGrade).toBe(totalGrade);
      expect(
        res.body.questions.map((q: { value: unknown }) => q.value),
      ).toEqual(expected);

      const db = await stored(res.body.id);
      expect(db.values).toEqual(expected);
      expect(db.sum).toBe(totalGrade);
      expect(db.total).toBe(totalGrade);
    },
  );

  it('011/US2-3 a visão do professor lida de novo traz "0.17" como string, nas mesmas posições', async () => {
    const { body } = await create("0.50", 3);
    const res = await client.get(`/api/works/${body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.totalGrade).toBe("0.50");
    const values = res.body.questions.map(
      (q: { position: number; value: unknown }) => [q.position, q.value],
    );
    expect(values).toEqual([
      [0, "0.17"],
      [1, "0.17"],
      [2, "0.16"],
    ]);
    for (const [, value] of values) expect(typeof value).toBe("string");
  });

  it('011/FR-011 "0.5" e "7" são aceitos e gravados com duas casas', async () => {
    const half = await create("0.5", 2);
    expect(half.status).toBe(201);
    expect(half.body.totalGrade).toBe("0.50");
    expect((await stored(half.body.id)).values).toEqual(["0.25", "0.25"]);

    const seven = await create("7", 3);
    expect(seven.status).toBe(201);
    expect(seven.body.totalGrade).toBe("7.00");
    expect((await stored(seven.body.id)).values).toEqual([
      "2.34",
      "2.33",
      "2.33",
    ]);
  });

  it("011/US2-5 três casas, negativa, zero, acima de 100,00, número, vírgula ou menos de 0,01 por questão → 400, sem arredondar e sem gravar", async () => {
    for (const [totalGrade, count] of [
      ["0.505", 1],
      ["10.001", 3],
      ["-1", 1],
      ["-0.50", 1],
      ["0", 1],
      ["0.00", 1],
      ["100.01", 1],
      ["1000", 1],
      [10, 1],
      ["0,50", 1],
      ["", 1],
      ["0.05", 10],
      ["0.02", 3],
    ] as const) {
      const res = await create(totalGrade, count);
      expect(res.status, `${JSON.stringify(totalGrade)} / ${count}`).toBe(400);
    }
    expect(await t.prisma.work.count()).toBe(0);
    expect(await t.prisma.workQuestion.count()).toBe(0);
  });

  it("011/US2-5 os limites são aceitos: 100,00 em 1 questão e 0,10 em 10", async () => {
    const max = await create("100.00", 1);
    expect(max.status).toBe(201);
    expect((await stored(max.body.id)).values).toEqual(["100.00"]);

    const min = await create("0.10", 10);
    expect(min.status).toBe(201);
    expect((await stored(min.body.id)).sum).toBe("0.10");
  });

  it("011/US2-6 011/SC-004 para notas de 0,01 a 10,00 com 1 a 10 questões, a soma gravada é igual à nota", async () => {
    // A sample of the SC-004 range through the route (the full range is covered by the
    // distributeGrade unit test): odd remainders, every count, and the extremes.
    const cases: [string, number][] = [
      ["0.01", 1],
      ["0.07", 3],
      ["0.99", 4],
      ["1.01", 7],
      ["3.33", 9],
      ["9.99", 10],
      ["10.00", 6],
      ["2.29", 8],
    ];
    for (const [totalGrade, count] of cases) {
      const res = await create(totalGrade, count);
      expect(res.status, `${totalGrade} / ${count}`).toBe(201);
      const db = await stored(res.body.id);
      expect(db.sum, `${totalGrade} / ${count}`).toBe(totalGrade);
      expect(db.values).toHaveLength(count);
      // Equal weight: values differ by at most one hundredth, larger ones first.
      const sorted = [...db.values].sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true }),
      );
      expect(db.values).toEqual(sorted);
    }
  });
});
