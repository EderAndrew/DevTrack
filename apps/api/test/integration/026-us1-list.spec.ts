import type { StudentActivityPage } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 026/US1 — "Minhas atividades" of one subject: with `classId` the list (filters, cursor and page size included) never
 * carries an activity of another class of the student; a class with nothing applied answers an empty page.
 */

const START = "2026-11-16T12:00:00.000Z";

describe("026/US1 lista do aluno por matéria", () => {
  let t: TestApp;
  let clock: FixedClock;
  let client: ReturnType<typeof api>;
  let classA: SchoolClass;
  let classB: SchoolClass;
  let empty: SchoolClass;
  let work: WorkFixture;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const assignment = (schoolClass: SchoolClass, title: string, publishAt: number, dueIn: number) =>
    createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      title,
      publishAt: at(publishAt),
      deadline: at(dueIn),
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
    });
  // publishAt from the test's clock: the factory's default is the real time minus a day, which falls after START.
  const exercise = (schoolClass: SchoolClass, title: string) =>
    createActivity(t, schoolClass, { type: "EXERCISE", title, publishAt: at(-DAY) });
  const page = async (query: string) => {
    const res = await client.get(`/api/me/activities${query}`);
    expect(res.status).toBe(200);
    return res.body as StudentActivityPage;
  };
  const titles = (body: StudentActivityPage) => body.items.map((item) => item.title).sort();

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const student = await createUser(t, { roles: ["STUDENT"] });
    client = api(t, { cookie: await loginAs(t, student) });
    const poo = await createConfirmedSyllabus(t, teacher.id);
    work = await createWork(t, teacher.id, { syllabus: poo });
    classA = await createClass(t, teacher.id, { name: "ADS 3NA", subjectId: poo.subject.id });
    classB = await createClass(t, teacher.id, { name: "ADS 3NA — SQL" });
    empty = await createClass(t, teacher.id, { name: "ADS 3NA — Redes" });
    for (const schoolClass of [classA, classB, empty]) await createEnrollment(t, schoolClass.id, student.id);

    await assignment(classA, "A — Trabalho 1", -DAY, DAY);
    await assignment(classA, "A — Trabalho 2", -DAY, 2 * DAY);
    await assignment(classA, "A — Trabalho atrasado", -3 * DAY, -DAY);
    await exercise(classA, "A — Exercício");
    await assignment(classB, "B — Trabalho", -DAY, DAY);
    await assignment(classB, "B — Trabalho atrasado", -3 * DAY, -2 * DAY);
    await exercise(classB, "B — Exercício");
  });

  it("026/US1-1 026/SC-002 com a turma A, nenhum item de B (nem com situação ou tipo), e o inverso", async () => {
    const queries = ["", "&status=PENDING", "&status=OVERDUE", "&type=ASSIGNMENT", "&type=EXERCISE", "&status=PENDING&type=ASSIGNMENT"];
    for (const [own, other] of [
      [classA, classB],
      [classB, classA],
    ] as const) {
      for (const extra of queries) {
        const body = await page(`?classId=${own.id}${extra}`);
        expect(body.items.every((item) => item.class.id === own.id)).toBe(true);
        expect(body.items.some((item) => item.class.id === other.id)).toBe(false);
      }
    }
    expect(titles(await page(`?classId=${classA.id}`))).toEqual(["A — Exercício", "A — Trabalho 1", "A — Trabalho 2", "A — Trabalho atrasado"]);
    expect(titles(await page(`?classId=${classB.id}`))).toEqual(["B — Exercício", "B — Trabalho", "B — Trabalho atrasado"]);
  });

  it("026/US1-3 situação e tipo combinados com a turma", async () => {
    expect(titles(await page(`?classId=${classA.id}&status=OVERDUE`))).toEqual(["A — Trabalho atrasado"]);
    expect(titles(await page(`?classId=${classA.id}&type=ASSIGNMENT&status=PENDING`))).toEqual(["A — Trabalho 1", "A — Trabalho 2"]);
    expect(titles(await page(`?classId=${classB.id}&type=EXERCISE`))).toEqual(["B — Exercício"]);
  });

  it("026/US1-4 turma sem atividades → página vazia", async () => {
    expect(await page(`?classId=${empty.id}`)).toEqual({ items: [], nextCursor: null });
  });

  it("026/US1-5 pageSize=1 e o cursor com o mesmo classId percorrem só a turma A, sem repetir nem pular", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const body: StudentActivityPage = await page(`?classId=${classA.id}&pageSize=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.class.id).toBe(classA.id);
      seen.push(body.items[0]!.id);
      cursor = body.nextCursor;
    } while (cursor !== null && seen.length < 10);
    expect(new Set(seen).size).toBe(seen.length);
    const all = await page(`?classId=${classA.id}`);
    expect(seen).toEqual(all.items.map((item) => item.id));
  });
});
