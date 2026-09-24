import { ClassPlanEnvelopeSchema, ClassPlanViewSchema, MAX_TOPICS_PER_PLAN, PlanCoverageSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClass,
  createConfirmedRevision,
  createMeetings,
  createSubject,
  createSyllabusDocument,
  createUser,
  loginAs,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const PERIOD = { startsOn: "2027-02-01", endsOn: "2027-06-30" };

/** The confirmed POO syllabus of the independent test: 16 items in two groups. */
const POO_GROUPS = [
  {
    title: "Fundamentos",
    items: [
      "Conceitos de classes, objetos e métodos",
      "Atributos e estado",
      "Construtores",
      "Encapsulamento, herança e polimorfismo",
      "Classes abstratas",
      "Interfaces",
      "Tratamento de exceções",
      "Coleções",
    ],
  },
  {
    title: "Práticas",
    items: [
      "Composição e agregação",
      "Padrões de projeto",
      "Testes de unidade",
      "Refatoração",
      "Genéricos",
      "Programação orientada a eventos",
      "Persistência de objetos",
      "Modelagem UML",
    ],
  },
];

describe("004/US5 — planejamento e tópicos a partir da ementa confirmada (FR-031 – FR-042)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  /** A plannable POO class with its confirmed syllabus (not yet selected) and `meetings` dates. */
  async function setup(options: { meetings?: string[] } = {}) {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id, { name: "Programação Orientada a Objetos" });
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...PERIOD });
    const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED" });
    const confirmed = await createConfirmedRevision(t, document.id, POO_GROUPS);
    const meetings = await createMeetings(t, schoolClass.id, options.meetings ?? []);
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const base = `/api/classes/${schoolClass.id}/plan`;
    return {
      teacher,
      subject,
      schoolClass,
      document,
      confirmed,
      meetings,
      client,
      getPlan: () => client.get(base),
      coverage: () => client.get(`${base}/coverage`),
      select: (revisionId: string, planRevision: number | null = null) =>
        client.put(`${base}/syllabus`, { planRevision, revisionId }),
      createTopic: (body: Record<string, unknown>) => client.post(`${base}/topics`, { itemIds: [], ...body }),
    };
  }

  /** Selects the confirmed syllabus through the API and returns the plan it created. */
  async function withPlan(options: { meetings?: string[] } = {}) {
    const ctx = await setup(options);
    const res = await ctx.select(ctx.confirmed.revision.id);
    expect(res.status).toBe(200);
    return { ...ctx, plan: ClassPlanViewSchema.parse(res.body) };
  }

  /**
   * A confirmed revision of `documentId` copied from `basedOn` (source REVISION): each entry of
   * `items` is `[text, originItemId | null]`, so the plan can remap links by origin (E16).
   */
  async function confirmedCopy(documentId: string, basedOnRevisionId: string, items: [string, string | null][]) {
    const document = await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: documentId } });
    return t.prisma.runInTransaction(async (tx) => {
      const last = await tx.syllabusRevision.aggregate({ where: { documentId }, _max: { number: true } });
      const draft = await tx.syllabusRevision.create({
        data: { documentId, number: (last._max.number ?? 0) + 1, status: "DRAFT", source: "REVISION", basedOnRevisionId },
      });
      const group = await tx.syllabusGroup.create({ data: { revisionId: draft.id, position: 1, title: "Única" } });
      const ids: string[] = [];
      for (const [index, [text, originItemId]] of items.entries()) {
        const item = await tx.syllabusItem.create({
          data: { revisionId: draft.id, groupId: group.id, position: index + 1, text, originItemId },
        });
        ids.push(item.id);
      }
      const revision = await tx.syllabusRevision.update({
        where: { id: draft.id },
        data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: document.uploadedById },
      });
      return { revision, itemIds: ids };
    });
  }

  describe("planejamento: ementa usada (FR-031, E13)", () => {
    it("GET /classes/:id/plan sem planejamento → {plan: null}", async () => {
      const { getPlan } = await setup();
      const res = await getPlan();
      expect(res.status).toBe(200);
      expect(ClassPlanEnvelopeSchema.parse(res.body)).toEqual({ plan: null });
    });

    it("PUT …/plan/syllabus com revisão confirmada → cria DRAFT e grava class_plan.syllabus_selected", async () => {
      const { teacher, schoolClass, subject, document, confirmed, select, getPlan } = await setup({
        meetings: ["2027-02-03", "2027-02-10"],
      });

      const res = await select(confirmed.revision.id);

      expect(res.status).toBe(200);
      const plan = ClassPlanViewSchema.parse(res.body);
      expect(plan).toMatchObject({
        classId: schoolClass.id,
        status: "DRAFT",
        revision: 1,
        syllabus: {
          subjectId: subject.id,
          documentId: document.id,
          documentVersion: 1,
          revisionId: confirmed.revision.id,
          revisionNumber: confirmed.revision.number,
        },
        topics: [],
        archivedTopicCount: 0,
      });
      expect(plan.meetings.map((m) => [m.number, m.date])).toEqual([
        [1, "2027-02-03"],
        [2, "2027-02-10"],
      ]);
      expect((await getPlan()).body).toEqual({ plan });

      const [event] = await events("class_plan.syllabus_selected");
      expect(event).toMatchObject({ actorUserId: teacher.id, targetType: "CLASS_PLAN", targetId: plan.id });
      expect(event!.metadata).toEqual({
        classId: schoolClass.id,
        revisionId: confirmed.revision.id,
        previousRevisionId: null,
        outsideRevisionLinks: 0,
      });
    });

    it("revisão em rascunho → 422 REVISION_NOT_CONFIRMED, sem planejamento", async () => {
      const { document, schoolClass, select } = await setup();
      const draft = await t.prisma.syllabusRevision.create({
        data: { documentId: document.id, number: 9, status: "DRAFT", source: "MANUAL" },
      });

      const res = await select(draft.id);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("REVISION_NOT_CONFIRMED");
      expect(await t.prisma.classPlan.count({ where: { classId: schoolClass.id } })).toBe(0);
    });

    it("revisão de outra disciplina do professor ou de outro professor → 404", async () => {
      const { teacher, select } = await setup();
      const otherSubject = await createSubject(t, teacher.id, { name: "Estruturas de Dados" });
      const otherDocument = await createSyllabusDocument(t, otherSubject.id, { status: "PROCESSED" });
      const otherRevision = await createConfirmedRevision(t, otherDocument.id, [{ items: ["Listas"] }]);

      const stranger = await createUser(t, { roles: ["TEACHER"] });
      const strangerSubject = await createSubject(t, stranger.id);
      const strangerDocument = await createSyllabusDocument(t, strangerSubject.id, { status: "PROCESSED" });
      const strangerRevision = await createConfirmedRevision(t, strangerDocument.id, [{ items: ["Pilhas"] }]);

      for (const revisionId of [otherRevision.revision.id, strangerRevision.revision.id, crypto.randomUUID()]) {
        const res = await select(revisionId);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("NOT_FOUND");
      }
    });

    it("turma de outro professor → 404 em todas as rotas do planejamento", async () => {
      const { schoolClass, confirmed } = await withPlan();
      const stranger = await createUser(t, { roles: ["TEACHER"] });
      const client = api(t, { cookie: await loginAs(t, stranger) });
      const base = `/api/classes/${schoolClass.id}/plan`;

      for (const res of [
        await client.get(base),
        await client.get(`${base}/coverage`),
        await client.put(`${base}/syllabus`, { planRevision: 1, revisionId: confirmed.revision.id }),
        await client.post(`${base}/topics`, { planRevision: 1, title: "Intruso", itemIds: [] }),
      ]) {
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("NOT_FOUND");
      }
    });

    it("turma sem disciplina ou datas → 422 CLASS_NOT_PLANNABLE ao escolher a ementa", async () => {
      const { teacher, confirmed } = await setup();
      const bare = await createClass(t, teacher.id);
      const client = api(t, { cookie: await loginAs(t, teacher) });

      const res = await client.put(`/api/classes/${bare.id}/plan/syllabus`, {
        planRevision: null,
        revisionId: confirmed.revision.id,
      });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("CLASS_NOT_PLANNABLE");
    });

    it("planejamento existente com planRevision null ou antigo → 409 PLAN_REVISION_CONFLICT", async () => {
      const { confirmed, select } = await withPlan();
      for (const planRevision of [null, 5]) {
        const res = await select(confirmed.revision.id, planRevision);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("PLAN_REVISION_CONFLICT");
      }
    });
  });

  describe("tópicos (FR-032 – FR-035)", () => {
    it("004/US5-1 tópico com item e aula 02 → DRAFT, MANUAL, ClassPlanView com revision + 1, topic.created sem título", async () => {
      const dates = ["2027-02-03", "2027-02-10", "2027-02-17"];
      const { teacher, plan, confirmed, createTopic } = await withPlan({ meetings: dates });
      const aula02 = plan.meetings.find((m) => m.number === 2)!;
      const item = confirmed.itemIds[0]!;

      const res = await createTopic({
        planRevision: plan.revision,
        title: "Classes, objetos e métodos",
        description: "Primeiros passos em POO.",
        meetingId: aula02.id,
        itemIds: [item],
      });

      expect(res.status).toBe(201);
      const view = ClassPlanViewSchema.parse(res.body);
      expect(view.revision).toBe(plan.revision + 1);
      expect(view.topics).toHaveLength(1);
      expect(view.topics[0]).toMatchObject({
        title: "Classes, objetos e métodos",
        description: "Primeiros passos em POO.",
        position: 1,
        meetingId: aula02.id,
        origin: "MANUAL",
        status: "DRAFT",
        items: [{ id: item, text: "Conceitos de classes, objetos e métodos", outsideRevision: false }],
        mergedIntoTopicId: null,
        splitFromTopicId: null,
      });
      expect(view.meetings.find((m) => m.id === aula02.id)!.topicCount).toBe(1);

      const [event] = await events("topic.created");
      expect(event).toMatchObject({ actorUserId: teacher.id, targetType: "TOPIC", targetId: view.topics[0]!.id });
      expect(event!.metadata).toEqual({ planId: plan.id, itemCount: 1, hasMeeting: true });
      expect(JSON.stringify(event!.metadata)).not.toContain("Classes, objetos");
    });

    it("004/US5-1 planejamento pronto → tópico novo já ACTIVE (FR-039)", async () => {
      const { plan, createTopic } = await withPlan();
      await t.prisma.classPlan.update({ where: { id: plan.id }, data: { status: "READY" } });

      const res = await createTopic({ planRevision: plan.revision, title: "Revisão geral" });

      expect(res.status).toBe(201);
      expect(res.body.topics[0].status).toBe("ACTIVE");
    });

    it("004/US5-2 sem planejamento (ementa não escolhida) → 422 SYLLABUS_REQUIRED", async () => {
      const { schoolClass, createTopic } = await setup();

      const res = await createTopic({ planRevision: 1, title: "Classes" });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("SYLLABUS_REQUIRED");
      expect(await t.prisma.topic.count()).toBe(0);
      expect(await t.prisma.classPlan.count({ where: { classId: schoolClass.id } })).toBe(0);
    });

    it("004/US5-4 o mesmo item em três tópicos conta uma vez na cobertura", async () => {
      const { plan, confirmed, createTopic, coverage } = await withPlan();
      const item = confirmed.itemIds[3]!; // "Encapsulamento, herança e polimorfismo"

      let revision = plan.revision;
      const topicIds: string[] = [];
      for (const title of ["Encapsulamento", "Herança", "Polimorfismo"]) {
        const res = await createTopic({ planRevision: revision, title, itemIds: [item] });
        expect(res.status).toBe(201);
        revision = res.body.revision;
        topicIds.push(res.body.topics.at(-1).id);
      }

      const res = await coverage();
      expect(res.status).toBe(200);
      const body = PlanCoverageSchema.parse(res.body);
      expect(body).toMatchObject({ coveredCount: 1, totalCount: 16 });
      const covered = body.groups.flatMap((group) => group.items).find((entry) => entry.id === item)!;
      expect(covered.topicIds).toEqual(topicIds);
    });

    it("004/US5-5 tópicos sem aula voltam com meetingId null, em ordem de criação", async () => {
      const { plan, createTopic, getPlan } = await withPlan({ meetings: ["2027-02-03"] });
      let revision = plan.revision;
      for (const title of ["Primeiro", "Segundo", "Terceiro"]) {
        const res = await createTopic({ planRevision: revision, title });
        revision = res.body.revision;
      }

      const view = ClassPlanEnvelopeSchema.parse((await getPlan()).body).plan!;
      expect(view.topics.map((topic) => [topic.title, topic.position, topic.meetingId])).toEqual([
        ["Primeiro", 1, null],
        ["Segundo", 2, null],
        ["Terceiro", 3, null],
      ]);
      const [event] = await events("topic.created");
      expect(event!.metadata).toEqual({ planId: plan.id, itemCount: 0, hasMeeting: false });
    });

    it("004/US5-6 não há rota de geração de tópicos, e origin no corpo → 400", async () => {
      const { schoolClass, plan, client, createTopic } = await withPlan();

      const generate = await client.post(`/api/classes/${schoolClass.id}/plan/topics/generate`, {});
      expect(generate.status).toBe(404);

      const res = await createTopic({ planRevision: plan.revision, title: "Gerado?", origin: "GENERATED" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(await t.prisma.topic.count()).toBe(0);
    });

    it("item fora da revisão usada → 422 SYLLABUS_ITEM_NOT_IN_PLAN; item de outro professor → 404", async () => {
      const { subject, plan, createTopic } = await withPlan();
      const newer = await createSyllabusDocument(t, subject.id, { status: "PROCESSED", fixture: "poo.docx" });
      const newerRevision = await createConfirmedRevision(t, newer.id, [{ items: ["Só na versão 2"] }]);

      const outside = await createTopic({ planRevision: plan.revision, title: "Fora", itemIds: [newerRevision.itemIds[0]] });
      expect(outside.status).toBe(422);
      expect(outside.body.code).toBe("SYLLABUS_ITEM_NOT_IN_PLAN");

      const stranger = await createUser(t, { roles: ["TEACHER"] });
      const strangerSubject = await createSubject(t, stranger.id);
      const strangerDocument = await createSyllabusDocument(t, strangerSubject.id, { status: "PROCESSED" });
      const strangerRevision = await createConfirmedRevision(t, strangerDocument.id, [{ items: ["Alheio"] }]);
      for (const itemId of [strangerRevision.itemIds[0], crypto.randomUUID()]) {
        const res = await createTopic({ planRevision: plan.revision, title: "Alheio", itemIds: [itemId] });
        expect(res.status).toBe(404);
      }
      expect(await t.prisma.topic.count()).toBe(0);
    });

    it("encontro de outra turma → 404", async () => {
      const { teacher, subject, plan, createTopic } = await withPlan();
      const otherClass = await createClass(t, teacher.id, { subjectId: subject.id, ...PERIOD });
      const [otherMeeting] = await createMeetings(t, otherClass.id, ["2027-02-03"]);

      const res = await createTopic({ planRevision: plan.revision, title: "Aula alheia", meetingId: otherMeeting!.id });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    });

    it("301º tópico não arquivado → 422 TOO_MANY_TOPICS; arquivados não contam", async () => {
      const { teacher, plan, createTopic } = await withPlan();
      await t.prisma.topic.createMany({
        data: Array.from({ length: MAX_TOPICS_PER_PLAN + 1 }, (_, index) => ({
          planId: plan.id,
          title: `Tópico ${index + 1}`,
          position: index + 1,
          origin: "MANUAL" as const,
          // The last one is archived: it does not count towards the limit.
          ...(index === MAX_TOPICS_PER_PLAN
            ? { status: "ARCHIVED" as const, statusBeforeArchive: "DRAFT" as const, archivedAt: new Date() }
            : { status: "DRAFT" as const }),
          createdById: teacher.id,
          updatedById: teacher.id,
        })),
      });

      const res = await createTopic({ planRevision: plan.revision, title: "Um a mais" });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("TOO_MANY_TOPICS");

      await t.prisma.topic.updateMany({
        where: { planId: plan.id, position: 1 },
        data: { status: "ARCHIVED", statusBeforeArchive: "DRAFT", archivedAt: new Date() },
      });
      expect((await createTopic({ planRevision: plan.revision, title: "Agora cabe" })).status).toBe(201);
    });

    it("004/FR-041 planRevision antigo → 409 PLAN_REVISION_CONFLICT, nada gravado", async () => {
      const { plan, createTopic } = await withPlan();
      const first = await createTopic({ planRevision: plan.revision, title: "Primeiro" });
      expect(first.status).toBe(201);

      const stale = await createTopic({ planRevision: plan.revision, title: "Atrasado" });

      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("PLAN_REVISION_CONFLICT");
      expect(await t.prisma.topic.count()).toBe(1);
      expect((await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision).toBe(plan.revision + 1);
    });

    it("planejamento arquivado → 409 PLAN_ARCHIVED", async () => {
      const { plan, createTopic } = await withPlan();
      await t.prisma.classPlan.update({ where: { id: plan.id }, data: { status: "ARCHIVED" } });

      const res = await createTopic({ planRevision: plan.revision, title: "Tarde demais" });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PLAN_ARCHIVED");
    });
  });

  it("004/FR-004 trocar a disciplina da turma com ementa selecionada → 409 CLASS_SUBJECT_LOCKED", async () => {
    const { teacher, schoolClass, subject, client, select, confirmed } = await setup();
    const other = await createSubject(t, teacher.id, { name: "Banco de Dados" });

    // Before a syllabus is selected the subject can still change.
    const free = await client.patch(`/api/classes/${schoolClass.id}`, { subjectId: other.id });
    expect(free.status).toBe(200);
    await client.patch(`/api/classes/${schoolClass.id}`, { subjectId: subject.id });

    expect((await select(confirmed.revision.id)).status).toBe(200);
    for (const subjectId of [other.id, null]) {
      const res = await client.patch(`/api/classes/${schoolClass.id}`, { subjectId });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CLASS_SUBJECT_LOCKED");
    }
    // Other fields still change.
    expect((await client.patch(`/api/classes/${schoolClass.id}`, { name: "POO — Noite" })).status).toBe(200);
    expect((await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: schoolClass.id } })).subjectId).toBe(subject.id);
  });

  it("004/FR-042 troca para nova versão confirmada: tópicos mantidos, ligações remapeadas por originItemId", async () => {
    const { schoolClass, document, confirmed, plan, createTopic, select, coverage: getCoverage } = await withPlan();
    const [classes, estado, construtores] = confirmed.itemIds as [string, string, string];

    const created = await createTopic({ planRevision: plan.revision, title: "Classes", itemIds: [classes, estado] });
    const second = await createTopic({ planRevision: created.body.revision, title: "Construtores", itemIds: [construtores] });
    const revision = second.body.revision as number;

    // Version 2 keeps "Classes" (copied), drops "Atributos e estado" and "Construtores", adds a new item.
    const copy = await confirmedCopy(document.id, confirmed.revision.id, [
      ["Classes e objetos", classes],
      ["Registros", null],
    ]);

    const res = await select(copy.revision.id, revision);

    expect(res.status).toBe(200);
    const view = ClassPlanViewSchema.parse(res.body);
    expect(view.revision).toBe(revision + 1);
    expect(view.syllabus.revisionId).toBe(copy.revision.id);
    expect(view.topics.map((topic) => topic.title)).toEqual(["Classes", "Construtores"]);
    expect(view.topics[0]!.items).toEqual([
      { id: copy.itemIds[0], text: "Classes e objetos", outsideRevision: false },
      { id: estado, text: "Atributos e estado", outsideRevision: true },
    ]);
    expect(view.topics[1]!.items).toEqual([{ id: construtores, text: "Construtores", outsideRevision: true }]);

    const [, event] = await events("class_plan.syllabus_selected");
    expect(event!.metadata).toEqual({
      classId: schoolClass.id,
      revisionId: copy.revision.id,
      previousRevisionId: confirmed.revision.id,
      outsideRevisionLinks: 2,
    });

    // Coverage counts only the items of the revision in use.
    const coverage = PlanCoverageSchema.parse((await getCoverage()).body);
    expect(coverage).toMatchObject({ coveredCount: 1, totalCount: 2 });
  });

  it("004/FR-040 cobertura por tópicos não arquivados; original e revisão confirmada inalterados", async () => {
    const { document, confirmed, plan, createTopic, coverage } = await withPlan();
    const snapshot = async () => ({
      document: await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: document.id } }),
      file: await t.prisma.storedFile.findUniqueOrThrow({ where: { id: document.fileId } }),
      revision: await t.prisma.syllabusRevision.findUniqueOrThrow({
        where: { id: confirmed.revision.id },
        include: { groups: { include: { items: true } } },
      }),
    });
    const before = await snapshot();

    const kept = await createTopic({ planRevision: plan.revision, title: "Classes", itemIds: [confirmed.itemIds[0]] });
    const archived = await createTopic({
      planRevision: kept.body.revision,
      title: "Construtores",
      itemIds: [confirmed.itemIds[2]],
    });
    await t.prisma.topic.update({
      where: { id: archived.body.topics[1].id },
      data: { status: "ARCHIVED", statusBeforeArchive: "DRAFT", archivedAt: new Date() },
    });

    const body = PlanCoverageSchema.parse((await coverage()).body);
    expect(body.totalCount).toBe(16);
    expect(body.coveredCount).toBe(1);
    expect(body.groups.map((group) => [group.title, group.items.length])).toEqual([
      ["Fundamentos", 8],
      ["Práticas", 8],
    ]);
    const items = body.groups.flatMap((group) => group.items);
    expect(items.find((entry) => entry.id === confirmed.itemIds[0])!.topicIds).toEqual([kept.body.topics[0].id]);
    expect(items.find((entry) => entry.id === confirmed.itemIds[2])!.topicIds).toEqual([]);

    expect(await snapshot()).toEqual(before);
  });

  it("cobertura sem planejamento → 404", async () => {
    const { coverage } = await setup();
    const res = await coverage();
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});
