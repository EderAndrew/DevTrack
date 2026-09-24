import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, loginAs, syllabusFixture, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { routeKey } from "./authorization-matrix";
import {
  buildTeacherArea,
  CURRICULUM_ROUTES,
  curriculumSnapshot,
  resourceIdFor,
  type TeacherArea,
  VALID_BODY,
} from "./004-curriculum-authorization-matrix";

/** Fields the server owns (FR-045), plus one it has never heard of. */
const SERVER_FIELDS: Record<string, unknown> = {
  teacherId: "00000000-0000-4000-8000-000000000000",
  ownerId: "00000000-0000-4000-8000-000000000000",
  processingStatus: "PROCESSED",
  sha256: "00".repeat(32),
  storageKey: "stored/elsewhere",
  origin: "GENERATED",
  version: 99,
  status: "ACTIVE",
  campoDesconhecido: true,
};

/** Routes with a JSON body; `status` is the request's own field on the subject status route. */
const JSON_ROUTES = CURRICULUM_ROUTES.filter((entry) => entry.method !== "GET" && !entry.upload);

/**
 * 004/US8-4, 004/FR-045: every 004 JSON body is strict. A server-controlled or unknown field is
 * refused (400) before anything is written; so is an extra form field on the upload.
 */
describe("004/US8-4 004/FR-045 campos controlados pelo servidor e desconhecidos → 400 sem efeito", () => {
  let t: TestApp;
  let owner: TestUser;
  let area: TeacherArea;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    owner = await createUser(t, { roles: ["TEACHER"] });
    area = await buildTeacherArea(t, owner);
  });
  afterAll(() => t.close());

  const cases = JSON_ROUTES.flatMap((entry) =>
    Object.keys(SERVER_FIELDS)
      // The status route's body is `{status}` itself.
      .filter((field) => !(routeKey(entry) === "POST /subjects/:id/status" && field === "status"))
      .map((field) => [routeKey(entry), field, entry] as const),
  );

  it.each(cases)("%s com %s → 400 VALIDATION_ERROR", async (_key, field, entry) => {
    const client = api(t, { cookie: await loginAs(t, owner) });
    const url = `/api${entry.path.replace(":id", entry.path.includes(":id") ? resourceIdFor(entry, area) : "").replace(":topicId", area.topicId)}`;
    const body = { ...VALID_BODY[routeKey(entry)]!(area), [field]: SERVER_FIELDS[field] };
    const before = await curriculumSnapshot(t);

    const res =
      entry.method === "PUT" ? await client.put(url, body) : entry.method === "PATCH" ? await client.patch(url, body) : await client.post(url, body);

    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: "VALIDATION_ERROR" });
    expect(await curriculumSnapshot(t)).toEqual(before);
  });

  it("resolução do calendário com campo do servidor dentro da lista → 400", async () => {
    const client = api(t, { cookie: await loginAs(t, owner) });
    const res = await client.put(`/api/classes/${area.classId}/meetings`, {
      planRevision: 1,
      add: [],
      remove: ["2027-02-03"],
      resolutions: [{ topicId: area.topicId, action: "ARCHIVE", status: "ARCHIVED" }],
    });
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: "VALIDATION_ERROR" });
  });

  it.each([
    ["GET /subjects", "/api/subjects?teacherId=00000000-0000-4000-8000-000000000000"],
    ["GET /syllabus-documents/:id/file", () => `/api/syllabus-documents/${area.documentId}/file?storageKey=x`],
  ])("%s com parâmetro desconhecido na query → 400", async (_key, url) => {
    const client = api(t, { cookie: await loginAs(t, owner) });
    const res = await client.get(typeof url === "function" ? url() : url);
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("envio com campo de formulário extra além do arquivo → 400, nenhuma versão nova", async () => {
    const before = await curriculumSnapshot(t);
    const res = await api(t, { cookie: await loginAs(t, owner) })
      .upload(`/api/subjects/${area.subjectId}/syllabus-documents`, {
        bytes: syllabusFixture("poo.docx"),
        filename: "ementa.docx",
      })
      .field("processingStatus", "PROCESSED");
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: "VALIDATION_ERROR" });
    expect(await curriculumSnapshot(t)).toEqual(before);
  });
});
