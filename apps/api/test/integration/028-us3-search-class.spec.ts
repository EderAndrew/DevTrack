import type { StudentHistoryPage } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 028/US3 — the search and the matéria (028/FR-007, FR-011, FR-012; research HI6–HI8): `q` matches the title
 * (contains, case- and accent-insensitive) and narrows the list, `total` and `tabCounts`, never `totals`; `classId`
 * (an ACTIVE enrollment, the 026 check) narrows everything, `totals` too. A turma of 027 with two disciplinas of
 * different teachers, deliveries in both.
 */

type Client = ReturnType<typeof api>;

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();

describe("028/US3 buscar e filtrar por matéria", () => {
  let t: TestApp;
  let clock: FixedClock;
  let classA: SchoolClass;
  let classB: SchoolClass;
  let workA: WorkFixture;
  let workB: WorkFixture;
  let student: TestUser;
  let client: Client;
  const ids = {} as Record<"provaA" | "provaFinalB" | "provaAcentoA" | "trabalhoB", string>;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  /** A work delivered `ago` before now, released (GRADED) or not (AWAITING). */
  const delivered = async (schoolClass: SchoolClass, work: WorkFixture, title: string, ago: number, released: boolean) => {
    const { activity } = await createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      title,
      publishAt: at(-3 * DAY),
      deadline: at(2 * DAY),
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
      ...(released ? { resultReleasedAt: at(-MINUTE) } : {}),
    });
    await createAttemptRow(t, activity.id, student.id, {
      startedAt: at(-ago - HOUR),
      submission: { submittedAt: at(-ago), gradeCents: 70 },
    });
    return activity.id;
  };
  const historyOf = async (query = "") => {
    const res = await client.get(`/api/me/history${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentHistoryPage;
  };
  /** Every page with `pageSize=1`, following the cursor with the same filters. */
  const allPages = async (filters: Record<string, string>) => {
    const pages: StudentHistoryPage[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ ...filters, pageSize: "1" });
      if (cursor) params.set("cursor", cursor);
      const page: StudentHistoryPage = await historyOf(`?${params}`);
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor !== null && pages.length < 50);
    return pages;
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    const teacherA = await createUser(t, { roles: ["TEACHER"] });
    const teacherB = await createUser(t, { roles: ["TEACHER"] });
    const syllabusA = await createConfirmedSyllabus(t, teacherA.id);
    const syllabusB = await createConfirmedSyllabus(t, teacherB.id);
    workA = await createWork(t, teacherA.id, { syllabus: syllabusA });
    workB = await createWork(t, teacherB.id, { syllabus: syllabusB });
    classA = await createClass(t, teacherA.id, { name: "ADS 3NA", subjectId: syllabusA.subject.id });
    classB = await createClass(t, teacherB.id, { cohortId: classA.cohortId, subjectId: syllabusB.subject.id });
    student = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, classA.id, student.id);
    client = api(t, { cookie: await loginAs(t, student) });

    ids.provaA = await delivered(classA, workA, "Prova de teste", 1 * HOUR, true);
    ids.provaFinalB = await delivered(classB, workB, "PROVA final", 2 * HOUR, false);
    ids.provaAcentoA = await delivered(classA, workA, "Próva de recuperação", 3 * HOUR, false);
    ids.trabalhoB = await delivered(classB, workB, "Trabalho de banco", 4 * HOUR, true);
  });

  const TOTALS = { delivered: 4, awaiting: 2, graded: 2 };

  it("028/US3-1 q=prova casa sem diferenciar maiúsculas e acentos; tabCounts e total seguem a busca, totals não", async () => {
    const body = await historyOf("?q=prova");
    expect(body.items.map((item) => item.id)).toEqual([ids.provaA, ids.provaFinalB, ids.provaAcentoA]);
    expect(body.total).toBe(3);
    expect(body.tabCounts).toEqual({ all: 3, awaiting: 2, graded: 1 });
    expect(body.totals).toEqual(TOTALS);
    expect((await historyOf("?q=PRÓVA")).items.map((item) => item.id)).toEqual(body.items.map((item) => item.id));
  });

  it("028/US3-1 q com espaços nas pontas = sem eles; q só de espaços = sem busca", async () => {
    const trimmed = await historyOf(`?q=${encodeURIComponent("  final  ")}`);
    expect(trimmed.items.map((item) => item.id)).toEqual([ids.provaFinalB]);
    const blank = await historyOf(`?q=${encodeURIComponent("   ")}`);
    expect(blank.total).toBe(4);
    expect(blank.tabCounts).toEqual({ all: 4, awaiting: 2, graded: 2 });
  });

  it("028/US3-2 busca sem resultado → items vazio e total 0, os cards intactos", async () => {
    const body = await historyOf("?q=inexistente");
    expect(body).toMatchObject({ items: [], nextCursor: null, total: 0, tabCounts: { all: 0, awaiting: 0, graded: 0 } });
    expect(body.totals).toEqual(TOTALS);
  });

  it("028/US3-4 classId da disciplina A estreita totals, tabCounts, items e total só à A", async () => {
    const body = await historyOf(`?classId=${classA.id}`);
    expect(body.items.map((item) => item.id)).toEqual([ids.provaA, ids.provaAcentoA]);
    expect(body.items.every((item) => item.class.id === classA.id)).toBe(true);
    expect(body.total).toBe(2);
    expect(body.tabCounts).toEqual({ all: 2, awaiting: 1, graded: 1 });
    expect(body.totals).toEqual({ delivered: 2, awaiting: 1, graded: 1 });
    const onlyB = await historyOf(`?classId=${classB.id}`);
    expect(onlyB.items.map((item) => item.id)).toEqual([ids.provaFinalB, ids.trabalhoB]);
  });

  it("028/US3-5 aba + busca + matéria combinadas, em todas as páginas", async () => {
    await delivered(classB, workB, "Prova extra", 5 * HOUR, true);
    const pages = await allPages({ tab: "GRADED", q: "prova", classId: classB.id });
    const items = pages.flatMap((page) => page.items);
    expect(items.map((item) => item.title)).toEqual(["Prova extra"]);
    const awaiting = await allPages({ tab: "AWAITING", q: "prova", classId: classB.id });
    expect(awaiting.flatMap((page) => page.items).map((item) => item.id)).toEqual([ids.provaFinalB]);
    for (const page of [...pages, ...awaiting]) {
      expect(page.tabCounts).toEqual({ all: 2, awaiting: 1, graded: 1 });
      expect(page.totals).toEqual({ delivered: 3, awaiting: 1, graded: 2 });
    }
    const allA = await allPages({ q: "prova", classId: classA.id });
    expect(allA.flatMap((page) => page.items).map((item) => item.id)).toEqual([ids.provaA, ids.provaAcentoA]);
    expect(allA.every((page) => page.total === 2)).toBe(true);
  });

  it("028/US3 matéria de uma turma encerrada (027, INACTIVE com matrícula ativa) continua aceita", async () => {
    await t.prisma.cohort.update({ where: { id: classA.cohortId }, data: { status: "INACTIVE", statusChangedAt: clock.now() } });
    const body = await historyOf(`?classId=${classA.id}`);
    expect(body.items.map((item) => item.id)).toEqual([ids.provaA, ids.provaAcentoA]);
    expect(body.totals.delivered).toBe(2);
  });
});
