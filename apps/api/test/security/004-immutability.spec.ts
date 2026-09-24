import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SyllabusProcessingWorker } from "../../src/modules/syllabus/syllabus-processing.worker";
import { createClass, createSubject, createUser, loginAs, syllabusFixture } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 004/SC-004, 004/US2-7, FR-010, FR-040: no operation on revisions, topics, the calendar or the
 * plan changes an original file or a confirmed revision. Every stored file and every confirmed
 * revision is fingerprinted when it appears and compared once everything else has run; the item
 * ids of a confirmed revision (what topics reference, FR-024) never change either.
 */
describe("004/SC-004 004/US2-7 004/FR-024 original e conteúdo confirmado imutáveis, itens com id estável", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(() => t.close());

  /** SHA-256 of the bytes as stored, next to the SHA-256 recorded at upload. */
  const files = async () =>
    (await t.prisma.storedFile.findMany({ orderBy: { id: "asc" } })).map((file) => ({
      id: file.id,
      recorded: Buffer.from(file.sha256).toString("hex"),
      actual: createHash("sha256").update(file.bytes).digest("hex"),
      sizeBytes: file.sizeBytes,
    }));

  const confirmedRevisions = async () =>
    t.prisma.syllabusRevision.findMany({
      where: { status: "CONFIRMED" },
      orderBy: { id: "asc" },
      include: {
        groups: { orderBy: { position: "asc" }, include: { items: { orderBy: { position: "asc" } } } },
      },
    });

  it("depois de revisar, confirmar, criar, editar, juntar, dividir, arquivar, mudar o calendário e trocar a versão usada", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id);
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, startsOn: "2027-02-01", endsOn: "2027-06-30" });
    const client = api(t, { cookie: await loginAs(t, teacher) });

    // Upload and processing.
    const upload = await client.upload(`/api/subjects/${subject.id}/syllabus-documents`, {
      bytes: syllabusFixture("poo.pdf"),
      filename: "poo.pdf",
      contentType: "application/pdf",
    });
    expect(upload.status).toBe(201);
    const documentId = upload.body.document.id as string;
    await t.get(SyllabusProcessingWorker).runOnce();
    const filesBefore = await files();
    expect(filesBefore.every((file) => file.recorded === file.actual)).toBe(true);

    // Review and confirm version 1.
    const draft = await client.post(`/api/syllabus-documents/${documentId}/revisions`, { source: "EXTRACTION" });
    expect(draft.status).toBe(201);
    const groups = (draft.body.groups as { title: string | null; items: { id: string; text: string }[] }[]).map((group) => ({
      title: group.title,
      items: group.items.map((item) => ({ id: item.id, text: item.text })),
    }));
    groups[0]!.items[0]!.text = "Classes, objetos e métodos";
    expect((await client.put(`/api/syllabus-revisions/${draft.body.id}`, { groups })).status).toBe(200);
    expect((await client.post(`/api/syllabus-revisions/${draft.body.id}/confirm`)).status).toBe(200);
    const firstConfirmed = await confirmedRevisions();
    expect(firstConfirmed).toHaveLength(1);

    // Plan, calendar and topics.
    const base = `/api/classes/${schoolClass.id}/plan`;
    const selected = await client.put(`${base}/syllabus`, { planRevision: null, revisionId: draft.body.id });
    expect(selected.status).toBe(200);
    let revision = selected.body.revision as number;
    const write = async (method: "post" | "patch" | "put", path: string, body: object = {}) => {
      const res = await client[method](`${base}${path}`, { planRevision: revision, ...body });
      expect(res.status, `${method} ${path}`).toBeLessThan(300);
      revision = res.body.revision;
      return res.body as { topics: { id: string; items: { id: string }[] }[] };
    };
    const calendar = await client.put(`/api/classes/${schoolClass.id}/meetings`, {
      planRevision: revision,
      add: ["2027-03-03", "2027-03-10", "2027-03-17"],
      remove: [],
      resolutions: [],
    });
    revision = calendar.body.planRevision;
    const itemIds = (await client.get(`${base}/coverage`)).body.groups.flatMap((group: { items: { id: string }[] }) =>
      group.items.map((item) => item.id),
    ) as string[];
    const first = (await write("post", "/topics", { title: "A", meetingId: calendar.body.items[0].id, itemIds: itemIds.slice(0, 2) }))
      .topics.at(-1)!;
    const second = (await write("post", "/topics", { title: "B", meetingId: calendar.body.items[2].id, itemIds: itemIds.slice(2, 3) }))
      .topics.at(-1)!;
    const third = (await write("post", "/topics", { title: "C", itemIds: [] })).topics.at(-1)!;
    await write("patch", `/topics/${first.id}`, { title: "A editado", itemIds: itemIds.slice(0, 3) });
    await write("post", "/topics/merge", { topicIds: [first.id, third.id], title: "A + C", itemIds: itemIds.slice(0, 3) });
    await write("post", `/topics/${first.id}/split`, {
      parts: [
        { title: "A1", itemIds: itemIds.slice(0, 1) },
        { title: "A2", itemIds: itemIds.slice(1, 3) },
      ],
    });
    await write("post", `/topics/${second.id}/archive`);
    // Unmark the last day (its topic is archived) and add another.
    const recalendar = await client.put(`/api/classes/${schoolClass.id}/meetings`, {
      planRevision: revision,
      add: ["2027-03-24"],
      remove: ["2027-03-17"],
      resolutions: [],
    });
    expect(recalendar.status).toBe(200);
    revision = recalendar.body.planRevision;

    // Version 1, revision 2 (copied from the confirmed one), then switch the plan to it.
    const copy = await client.post(`/api/syllabus-documents/${documentId}/revisions`, {
      source: "REVISION",
      basedOnRevisionId: draft.body.id,
    });
    expect(copy.status).toBe(201);
    const copyGroups = (copy.body.groups as { title: string | null; items: { id: string; text: string }[] }[]).map((group) => ({
      title: group.title,
      items: group.items.slice(1).map((item) => ({ id: item.id, text: item.text })),
    }));
    expect((await client.put(`/api/syllabus-revisions/${copy.body.id}`, { groups: copyGroups })).status).toBe(200);
    expect((await client.post(`/api/syllabus-revisions/${copy.body.id}/confirm`)).status).toBe(200);
    const bothConfirmed = await confirmedRevisions();
    await write("put", "/syllabus", { revisionId: copy.body.id });
    await write("post", "/status", { action: "CONFIRM" });

    // Nothing changed in the originals nor in the confirmed contents.
    expect(await files()).toEqual(filesBefore);
    const after = await confirmedRevisions();
    expect(after.find((row) => row.id === draft.body.id)).toEqual(firstConfirmed[0]);
    expect(after).toEqual(bothConfirmed);
  });
});
