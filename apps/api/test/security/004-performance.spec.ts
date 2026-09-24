import { MAX_MEETINGS_PER_CLASS, MAX_PDF_PAGES, MAX_TOPICS_PER_PLAN } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SyllabusProcessingWorker } from "../../src/modules/syllabus/syllabus-processing.worker";
import { textPdf } from "../fixtures/syllabus/build-fixtures";
import {
  createClass,
  createConfirmedRevision,
  createPlan,
  createSubject,
  createSyllabusDocument,
  createUser,
  dbDate,
  loginAs,
  syllabusFixture,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MIB = 1024 * 1024;

/** Milliseconds `run` takes. */
async function timed<T>(run: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await run();
  return { result, ms: performance.now() - start };
}

/** Bytes padded with spaces after the end of the file up to exactly `size` (readers ignore them). */
const padded = (bytes: Uint8Array, size: number) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(size - bytes.length, 0x20)]);

/**
 * 004/SC-006: the upload answers fast whatever the file (reading happens later, in the worker),
 * a 10-page PDF is processed well within a minute, and the largest plan loads in under a second.
 */
describe("004/SC-006 desempenho", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  async function teacherWithSubject() {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id);
    return { teacher, subject, client: api(t, { cookie: await loginAs(t, teacher) }) };
  }

  it.each([
    ["PDF de texto com 10 MB", () => padded(syllabusFixture("poo.pdf"), 10 * MIB), "grande.pdf", "application/pdf"],
    [
      `PDF de ${MAX_PDF_PAGES} páginas gerado em memória, com 10 MB`,
      () =>
        padded(
          textPdf(Array.from({ length: MAX_PDF_PAGES }, (_, page) => [{ text: `Página ${page + 1} da ementa` }])),
          10 * MIB,
        ),
      "cinquenta.pdf",
      "application/pdf",
    ],
    ["PNG com 10 MB", () => padded(syllabusFixture("ementa.png"), 10 * MIB), "grande.png", "image/png"],
  ])("envio de %s responde em até 2 s", async (_label, bytes, filename, contentType) => {
    const { subject, client } = await teacherWithSubject();
    const file = bytes();
    expect(file.length).toBe(10 * MIB);

    const { result, ms } = await timed(() =>
      client.upload(`/api/subjects/${subject.id}/syllabus-documents`, { bytes: file, filename, contentType }),
    );

    expect(result.status).toBe(201);
    expect(ms).toBeLessThanOrEqual(2000);
  });

  it("processamento de dez-paginas.pdf em até 1 min", async () => {
    const { subject, client } = await teacherWithSubject();
    const upload = await client.upload(`/api/subjects/${subject.id}/syllabus-documents`, {
      bytes: syllabusFixture("dez-paginas.pdf"),
      filename: "dez-paginas.pdf",
      contentType: "application/pdf",
    });
    expect(upload.status).toBe(201);

    const { result, ms } = await timed(() => t.get(SyllabusProcessingWorker).runOnce());

    expect(result).toBe(1);
    expect(ms).toBeLessThanOrEqual(60_000);
    const document = await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: upload.body.document.id } });
    expect(document).toMatchObject({ processingStatus: "PROCESSED", pageCount: 10 });
  });

  it(`planejamento com ${MAX_MEETINGS_PER_CLASS} encontros e ${MAX_TOPICS_PER_PLAN} tópicos carrega em até 1 s (e a cobertura também)`, async () => {
    const { teacher, subject, client } = await teacherWithSubject();
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, startsOn: "2027-01-01", endsOn: "2027-12-31" });
    const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED" });
    const items = Array.from({ length: 500 }, (_, index) => `Item ${index + 1}`);
    const confirmed = await createConfirmedRevision(t, document.id, [
      { title: "Primeira metade", items: items.slice(0, 250) },
      { title: "Segunda metade", items: items.slice(250) },
    ]);
    const plan = await createPlan(t, schoolClass.id, confirmed.revision.id);
    await t.prisma.classMeeting.createMany({
      data: Array.from({ length: MAX_MEETINGS_PER_CLASS }, (_, index) => ({
        classId: schoolClass.id,
        meetingDate: new Date(dbDate("2027-01-01").getTime() + index * 24 * 3600 * 1000),
      })),
    });
    const meetings = await t.prisma.classMeeting.findMany({ where: { classId: schoolClass.id }, orderBy: { meetingDate: "asc" } });
    await t.prisma.topic.createMany({
      data: Array.from({ length: MAX_TOPICS_PER_PLAN }, (_, index) => ({
        planId: plan.id,
        meetingId: index % 3 === 0 ? null : meetings[index % meetings.length]!.id,
        title: `Tópico ${index + 1}`,
        description: "Descrição do tópico.",
        position: index + 1,
        origin: "MANUAL" as const,
        status: "DRAFT" as const,
        createdById: teacher.id,
        updatedById: teacher.id,
      })),
    });
    const topics = await t.prisma.topic.findMany({ where: { planId: plan.id }, select: { id: true } });
    await t.prisma.topicSyllabusItem.createMany({
      data: topics.flatMap((topic, index) =>
        [0, 1, 2].map((offset) => ({ topicId: topic.id, itemId: confirmed.itemIds[(index * 3 + offset) % confirmed.itemIds.length]! })),
      ),
    });

    // Warm up the route (connection, plan cache), then measure.
    await client.get(`/api/classes/${schoolClass.id}/plan`);
    const view = await timed(() => client.get(`/api/classes/${schoolClass.id}/plan`));
    const coverage = await timed(() => client.get(`/api/classes/${schoolClass.id}/plan/coverage`));

    expect(view.result.status).toBe(200);
    expect(view.result.body.plan.meetings).toHaveLength(MAX_MEETINGS_PER_CLASS);
    expect(view.result.body.plan.topics).toHaveLength(MAX_TOPICS_PER_PLAN);
    expect(view.ms).toBeLessThanOrEqual(1000);
    expect(coverage.result.body.totalCount).toBe(500);
    expect(coverage.ms).toBeLessThanOrEqual(1000);
  });
});
