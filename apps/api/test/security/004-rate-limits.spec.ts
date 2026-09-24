import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSubject, createSyllabusDocument, createUser, loginAs, syllabusFixture } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const UPLOADS = 3;
const RETRIES = 2;

/**
 * 004/US8-5, 004/FR-046: uploads and "Tentar novamente" have hourly limits per teacher (small
 * here). Over the limit → 429 RATE_LIMITED with `Retry-After`, nothing written; another
 * teacher's counters are untouched.
 */
describe("004/US8-5 004/FR-046 limites de envio e de nova tentativa por professor", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({
      config: { rateLimit: { ...testConfig().rateLimit, syllabusUploadsHourly: UPLOADS, syllabusRetriesHourly: RETRIES } },
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  async function teacher() {
    const user = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, user.id);
    const client = api(t, { cookie: await loginAs(t, user) });
    return {
      subject,
      client,
      upload: (fixture: string) =>
        client.upload(`/api/subjects/${subject.id}/syllabus-documents`, { bytes: syllabusFixture(fixture), filename: fixture }),
      retry: (documentId: string) => client.post(`/api/syllabus-documents/${documentId}/retry`),
    };
  }

  it("envios acima do limite → 429 com Retry-After, sem nova versão; outro professor segue enviando", async () => {
    const first = await teacher();
    const second = await teacher();
    for (let index = 0; index < UPLOADS; index++) expect((await first.upload("poo.pdf")).status).toBeLessThan(300);

    const blocked = await first.upload("poo.docx");

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ statusCode: 429, code: "RATE_LIMITED", message: expect.any(String) });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(await t.prisma.syllabusDocument.count({ where: { subjectId: first.subject.id } })).toBe(1);

    expect((await second.upload("poo.docx")).status).toBe(201);
  });

  it("\"Tentar novamente\" acima do limite → 429 com Retry-After, documento continua FAILED; outro professor não é afetado", async () => {
    const first = await teacher();
    const second = await teacher();
    const failed = await createSyllabusDocument(t, first.subject.id, { status: "FAILED" });
    const otherFailed = await createSyllabusDocument(t, second.subject.id, { status: "FAILED" });

    // Each call counts, even one that ends in 404 (a document that does not exist).
    for (let index = 0; index < RETRIES; index++) {
      expect((await first.retry(crypto.randomUUID())).status).toBe(404);
    }
    const blocked = await first.retry(failed.id);

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect((await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: failed.id } })).processingStatus).toBe("FAILED");

    const other = await second.retry(otherFailed.id);
    expect(other.status).toBe(202);
    expect(other.body.processingStatus).toBe("UPLOADED");
  });

  it("os dois limites são independentes: esgotar os envios não bloqueia a nova tentativa", async () => {
    const first = await teacher();
    const failed = await createSyllabusDocument(t, first.subject.id, { status: "FAILED" });
    for (let index = 0; index < UPLOADS; index++) await first.upload("poo.pdf");
    expect((await first.upload("poo.pdf")).status).toBe(429);

    expect((await first.retry(failed.id)).status).toBe(202);
  });
});
