import { describe, expect, it } from "vitest";
import {
  ChangePlanStatusRequestSchema,
  ClassListQuerySchema,
  ClassViewSchema,
  CreateClassRequestSchema,
  CreateSubjectRequestSchema,
  CreateSyllabusRevisionRequestSchema,
  CreateTopicRequestSchema,
  IsoDateSchema,
  MAX_ITEMS_PER_REVISION,
  MAX_ITEMS_PER_TOPIC,
  MAX_MEETINGS_PER_CLASS,
  MergeTopicsRequestSchema,
  ReorderTopicsRequestSchema,
  SaveSyllabusRevisionRequestSchema,
  SelectPlanSyllabusRequestSchema,
  SplitTopicRequestSchema,
  SyllabusExtractionSchema,
  TopicActionRequestSchema,
  UpdateClassMeetingsRequestSchema,
  UpdateClassRequestSchema,
  UpdateSubjectRequestSchema,
  UpdateTopicRequestSchema,
} from "../src/index.js";

const ID = "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11";
const ID2 = "7d1f4a2b-1c3e-4f56-8a9b-0c1d2e3f4a5b";
const ID3 = "a9b8c7d6-e5f4-4a3b-9c2d-1e0f9a8b7c6d";

/** Paths of the issues of a failed parse, e.g. ["endsOn"]. */
function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  expect(result.success).toBe(false);
  return result.error!.issues.map((issue) => issue.path.join("."));
}

describe("004/FR-045 contratos recusam campos desconhecidos e controlados pelo servidor", () => {
  it.each([
    ["CreateSubjectRequest", CreateSubjectRequestSchema, { name: "POO", status: "ACTIVE" }],
    ["CreateSubjectRequest (dono)", CreateSubjectRequestSchema, { name: "POO", teacherId: ID }],
    ["UpdateSubjectRequest", UpdateSubjectRequestSchema, { name: "POO", classCount: 3 }],
    ["CreateClassRequest", CreateClassRequestSchema, { name: "Turma", code: "T1", academicYear: 2027, plannable: true }],
    ["CreateSyllabusRevisionRequest", CreateSyllabusRevisionRequestSchema, { source: "MANUAL", status: "CONFIRMED" }],
    ["SaveSyllabusRevisionRequest", SaveSyllabusRevisionRequestSchema, { groups: [], confirmedAt: "2027-01-01" }],
    [
      "SaveSyllabusRevisionRequest (item)",
      SaveSyllabusRevisionRequestSchema,
      { groups: [{ items: [{ text: "Item", id: ID, originItemId: ID }] }] },
    ],
    ["UpdateClassMeetingsRequest", UpdateClassMeetingsRequestSchema, { planRevision: null, add: [], remove: [], resolutions: [], number: 1 }],
    ["CreateTopicRequest", CreateTopicRequestSchema, { planRevision: 1, title: "T", itemIds: [], status: "ACTIVE" }],
    ["CreateTopicRequest (origem)", CreateTopicRequestSchema, { planRevision: 1, title: "T", itemIds: [], origin: "GENERATED" }],
    ["UpdateTopicRequest", UpdateTopicRequestSchema, { planRevision: 1, title: "T", position: 3 }],
    ["TopicActionRequest", TopicActionRequestSchema, { planRevision: 1, reason: "TEACHER" }],
    ["SelectPlanSyllabusRequest", SelectPlanSyllabusRequestSchema, { planRevision: null, revisionId: ID, status: "READY" }],
  ])("%s com campo extra → recusado", (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("aceita os mesmos pedidos sem os campos extras", () => {
    expect(CreateSubjectRequestSchema.parse({ name: "  POO  " })).toEqual({ name: "POO" });
    expect(CreateSyllabusRevisionRequestSchema.safeParse({ source: "MANUAL" }).success).toBe(true);
    expect(CreateTopicRequestSchema.safeParse({ planRevision: 1, title: "T", itemIds: [] }).success).toBe(true);
    expect(TopicActionRequestSchema.safeParse({ planRevision: 1 }).success).toBe(true);
  });

  it("pedidos de edição exigem ao menos um campo", () => {
    expect(UpdateSubjectRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateTopicRequestSchema.safeParse({ planRevision: 1 }).success).toBe(false);
    expect(UpdateTopicRequestSchema.safeParse({ planRevision: 1, meetingId: null }).success).toBe(true);
  });
});

describe("004 datas de calendário", () => {
  it.each(["2027-02-28", "2028-02-29", "2027-12-31", "2027-01-01"])("%s é aceita", (date) => {
    expect(IsoDateSchema.safeParse(date).success).toBe(true);
  });

  it.each(["2027-02-30", "2027-02-29", "2027-13-01", "2027-04-31", "2027-1-5", "2027-01-01T00:00:00Z", "01/02/2027", ""])(
    "%s é recusada",
    (date) => {
      expect(IsoDateSchema.safeParse(date).success).toBe(false);
    },
  );

  const base = { name: "Turma A", code: "T-A", academicYear: 2027 };

  it("004/FR-003 turma sem disciplina nem datas continua válida", () => {
    expect(CreateClassRequestSchema.safeParse(base).success).toBe(true);
  });

  it("004/US1-5 turma com disciplina e período válido", () => {
    const value = { ...base, subjectId: ID, startsOn: "2027-02-01", endsOn: "2027-06-30" };
    expect(CreateClassRequestSchema.parse(value)).toEqual(value);
    expect(CreateClassRequestSchema.safeParse({ ...value, endsOn: "2027-02-01" }).success).toBe(true);
  });

  it("004/US1-5 término antes do início → erro no campo endsOn", () => {
    expect(issuePaths(CreateClassRequestSchema.safeParse({ ...base, startsOn: "2027-06-30", endsOn: "2027-02-01" }))).toEqual([
      "endsOn",
    ]);
  });

  it("004/US1-5 só uma das datas → erro no campo que falta", () => {
    expect(issuePaths(CreateClassRequestSchema.safeParse({ ...base, startsOn: "2027-02-01" }))).toEqual(["endsOn"]);
    expect(issuePaths(CreateClassRequestSchema.safeParse({ ...base, endsOn: "2027-02-01" }))).toEqual(["startsOn"]);
    expect(issuePaths(UpdateClassRequestSchema.safeParse({ startsOn: "2027-02-01", endsOn: null }))).toEqual(["endsOn"]);
    expect(issuePaths(UpdateClassRequestSchema.safeParse({ endsOn: "2027-06-30" }))).toEqual(["startsOn"]);
  });

  it("edição pode limpar as duas datas juntas ou mudar só outros campos", () => {
    expect(UpdateClassRequestSchema.safeParse({ startsOn: null, endsOn: null }).success).toBe(true);
    expect(UpdateClassRequestSchema.safeParse({ subjectId: null }).success).toBe(true);
    expect(UpdateClassRequestSchema.safeParse({ name: "Outra" }).success).toBe(true);
  });

  it("filtro por disciplina na lista de turmas", () => {
    expect(ClassListQuerySchema.safeParse({ subjectId: ID }).success).toBe(true);
    expect(ClassListQuerySchema.safeParse({ subjectId: "x" }).success).toBe(false);
  });

  it("a visão da turma traz a oferta e a situação do planejamento", () => {
    const view = {
      id: ID,
      name: "Turma A",
      code: "T-A",
      academicYear: 2027,
      period: null,
      description: null,
      status: "ACTIVE",
      activeStudentCount: 0,
      subject: { id: ID2, name: "POO" },
      startsOn: "2027-02-01",
      endsOn: "2027-06-30",
      plannable: true,
      planStatus: null,
      createdAt: "2027-01-01T00:00:00.000Z",
      updatedAt: "2027-01-01T00:00:00.000Z",
    };
    expect(ClassViewSchema.safeParse(view).success).toBe(true);
    expect(ClassViewSchema.safeParse({ ...view, planStatus: "PAUSED" }).success).toBe(false);
  });
});

describe("004 limites dos contratos", () => {
  it("revisão: até 500 itens no total, cada item com 1 a 1000 caracteres", () => {
    const items = (count: number) => Array.from({ length: count }, (_, index) => ({ text: `Item ${index}` }));
    const ok = { groups: [{ items: items(250) }, { title: "B", items: items(MAX_ITEMS_PER_REVISION - 250) }] };
    expect(SaveSyllabusRevisionRequestSchema.safeParse(ok).success).toBe(true);
    expect(SaveSyllabusRevisionRequestSchema.safeParse({ groups: [...ok.groups, { items: items(1) }] }).success).toBe(false);
    expect(SaveSyllabusRevisionRequestSchema.safeParse({ groups: [{ items: [{ text: "   " }] }] }).success).toBe(false);
    expect(SaveSyllabusRevisionRequestSchema.safeParse({ groups: [{ items: [{ text: "x".repeat(1001) }] }] }).success).toBe(false);
  });

  it("revisão a partir de outra exige basedOnRevisionId, e só nela", () => {
    expect(CreateSyllabusRevisionRequestSchema.safeParse({ source: "REVISION", basedOnRevisionId: ID }).success).toBe(true);
    expect(issuePaths(CreateSyllabusRevisionRequestSchema.safeParse({ source: "REVISION" }))).toEqual(["basedOnRevisionId"]);
    expect(issuePaths(CreateSyllabusRevisionRequestSchema.safeParse({ source: "EXTRACTION", basedOnRevisionId: ID }))).toEqual([
      "basedOnRevisionId",
    ]);
  });

  it("calendário: até 200 datas acrescentadas ou removidas por vez, só datas válidas", () => {
    const dates = (count: number) =>
      Array.from({ length: count }, (_, index) => new Date(Date.UTC(2027, 0, 1 + index)).toISOString().slice(0, 10));
    const request = { planRevision: null, add: dates(MAX_MEETINGS_PER_CLASS), remove: [], resolutions: [] };
    expect(UpdateClassMeetingsRequestSchema.safeParse(request).success).toBe(true);
    expect(UpdateClassMeetingsRequestSchema.safeParse({ ...request, add: dates(MAX_MEETINGS_PER_CLASS + 1) }).success).toBe(false);
    expect(UpdateClassMeetingsRequestSchema.safeParse({ ...request, add: ["2027-02-30"] }).success).toBe(false);
    expect(UpdateClassMeetingsRequestSchema.safeParse({ ...request, planRevision: 0 }).success).toBe(false);
  });

  it("resolução de tópico: cada ação com os seus campos", () => {
    const resolutions = [
      { topicId: ID, action: "MOVE", meetingDate: "2027-03-02" },
      { topicId: ID, action: "UNSCHEDULE" },
      { topicId: ID, action: "MERGE", intoTopicId: ID2 },
      { topicId: ID, action: "ARCHIVE" },
    ];
    const request = { planRevision: 1, add: [], remove: ["2027-03-01"], resolutions };
    expect(UpdateClassMeetingsRequestSchema.safeParse(request).success).toBe(true);
    for (const wrong of [
      { topicId: ID, action: "MOVE" },
      { topicId: ID, action: "MERGE" },
      { topicId: ID, action: "UNSCHEDULE", meetingDate: "2027-03-02" },
      { topicId: ID, action: "DELETE" },
    ]) {
      expect(UpdateClassMeetingsRequestSchema.safeParse({ ...request, resolutions: [wrong] }).success, JSON.stringify(wrong)).toBe(
        false,
      );
    }
  });

  it("tópico: título de 1 a 200 caracteres, até 100 itens sem repetição", () => {
    const topic = { planRevision: 1, title: "T", itemIds: [ID, ID2] };
    expect(CreateTopicRequestSchema.safeParse(topic).success).toBe(true);
    expect(CreateTopicRequestSchema.safeParse({ ...topic, title: "  " }).success).toBe(false);
    expect(CreateTopicRequestSchema.safeParse({ ...topic, title: "x".repeat(201) }).success).toBe(false);
    expect(CreateTopicRequestSchema.safeParse({ ...topic, itemIds: [ID, ID] }).success).toBe(false);
    const many = Array.from({ length: MAX_ITEMS_PER_TOPIC + 1 }, (_, index) => ID.slice(0, -3) + String(index).padStart(3, "0"));
    expect(CreateTopicRequestSchema.safeParse({ ...topic, itemIds: many.slice(0, -1) }).success).toBe(true);
    expect(CreateTopicRequestSchema.safeParse({ ...topic, itemIds: many }).success).toBe(false);
  });

  it("juntar exige de 2 a 20 tópicos distintos; dividir, de 2 a 10 partes", () => {
    const fields = { title: "Junto", itemIds: [] };
    expect(MergeTopicsRequestSchema.safeParse({ planRevision: 1, topicIds: [ID, ID2], ...fields }).success).toBe(true);
    expect(MergeTopicsRequestSchema.safeParse({ planRevision: 1, topicIds: [ID], ...fields }).success).toBe(false);
    expect(MergeTopicsRequestSchema.safeParse({ planRevision: 1, topicIds: [ID, ID], ...fields }).success).toBe(false);
    expect(SplitTopicRequestSchema.safeParse({ planRevision: 1, parts: [fields, fields] }).success).toBe(true);
    expect(SplitTopicRequestSchema.safeParse({ planRevision: 1, parts: [fields] }).success).toBe(false);
  });

  it("reordenar: cada tópico uma vez", () => {
    const items = [
      { topicId: ID, meetingId: null },
      { topicId: ID2, meetingId: ID3 },
    ];
    expect(ReorderTopicsRequestSchema.safeParse({ planRevision: 1, items }).success).toBe(true);
    expect(ReorderTopicsRequestSchema.safeParse({ planRevision: 1, items: [...items, items[0]] }).success).toBe(false);
  });

  it("situação do planejamento: só as quatro ações", () => {
    expect(ChangePlanStatusRequestSchema.safeParse({ planRevision: 1, action: "CONFIRM" }).success).toBe(true);
    expect(ChangePlanStatusRequestSchema.safeParse({ planRevision: 1, action: "DELETE" }).success).toBe(false);
  });

  it("extração: só a versão 1 do extrator", () => {
    const extraction = { extractorVersion: 1, title: null, syllabusText: null, competencyText: null, groups: [] };
    expect(SyllabusExtractionSchema.safeParse(extraction).success).toBe(true);
    expect(SyllabusExtractionSchema.safeParse({ ...extraction, extractorVersion: 2 }).success).toBe(false);
  });
});
