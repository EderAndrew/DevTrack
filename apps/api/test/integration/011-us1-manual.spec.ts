import { CreateWorkRequestSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import {
  type ConfirmedSyllabus,
  createConfirmedSyllabus,
  workLanguageId,
} from "../helpers/works";

/**
 * 011/US1 — the teacher creates a work by hand: 1–10 questions of any type, each with its answer
 * key, all or nothing, the values computed from the total grade, and no AI involved (011/FR-002,
 * FR-004–FR-008, FR-014, SC-001).
 */

const openAnswer = (overrides: object = {}) => ({
  type: "OPEN_ANSWER" as const,
  statement: "O que é herança?",
  explanation: "Reuso de comportamento.",
  expectedAnswer: "Reuso de comportamento de uma superclasse.",
  rubric: "Cita superclasse e reuso.",
  ...overrides,
});

const ALTERNATIVES = [
  { text: "extends", isCorrect: true },
  { text: "implements", isCorrect: false },
  { text: "inherits", isCorrect: false },
];

const multipleChoice = (
  alternatives: { text: string; isCorrect: boolean }[] = ALTERNATIVES,
  overrides: object = {},
) => ({
  type: "MULTIPLE_CHOICE" as const,
  statement: "Qual palavra-chave declara herança em Java?",
  alternatives,
  ...overrides,
});

const code = (languageId: string | undefined, overrides: object = {}) => ({
  type: "CODE" as const,
  statement: "Implemente a classe Cachorro.",
  instructions: "Cachorro deve estender Animal.",
  starterCode: "class Cachorro {}",
  expectedSolution:
    'class Cachorro extends Animal { String falar() { return "au"; } }',
  languageId,
  testCases: [
    { input: "falar()", expectedOutput: "au", visibility: "PUBLIC" },
    { input: "", expectedOutput: "", visibility: "PRIVATE" },
  ],
  ...overrides,
});

describe("011/US1 criar um trabalho manualmente", () => {
  let t: TestApp;
  let teacher: TestUser;
  let client: ReturnType<typeof api>;
  let syllabus: ConfirmedSyllabus;
  let java: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, {
      roles: ["TEACHER"],
      name: "Professora Ana",
    });
    client = api(t, { cookie: await loginAs(t, teacher) });
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    java = await workLanguageId(t, "java");
  });

  const body = (overrides: object = {}) => ({
    subjectId: syllabus.subject.id,
    title: "Trabalho de herança",
    description: "Entregar em duas semanas.",
    difficulty: "INTERMEDIATE",
    totalGrade: "10",
    topics: null,
    questions: [openAnswer(), multipleChoice(), code(java)],
    status: "DRAFT",
    ...overrides,
  });
  const create = (overrides: object = {}) =>
    client.post("/api/works", body(overrides));
  const nothingWritten = async () => {
    expect(await t.prisma.work.count()).toBe(0);
    expect(await t.prisma.workQuestion.count()).toBe(0);
    expect(
      await t.prisma.auditEvent.count({
        where: { type: { startsWith: "work" } },
      }),
    ).toBe(0);
  };
  /** The catalog survives `resetDb`: a seeded entry is deactivated for the test and restored after it. */
  async function withInactivePython(run: (pythonId: string) => Promise<void>) {
    const python = await t.prisma.programmingLanguage.update({
      where: { key: "python" },
      data: { active: false },
    });
    try {
      await run(python.id);
    } finally {
      await t.prisma.programmingLanguage.update({
        where: { key: "python" },
        data: { active: true },
      });
    }
  }
  const questions = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      openAnswer({ statement: `Questão ${index + 1}` }),
    );

  it("011/US1-1 011/SC-001 três questões, uma de cada tipo, entram no banco com origem MANUAL, valores calculados e criação auditada", async () => {
    const res = await create();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      subject: { id: syllabus.subject.id, name: syllabus.subject.name },
      syllabusRevisionId: null,
      topics: [],
      title: "Trabalho de herança",
      description: "Entregar em duas semanas.",
      difficulty: "INTERMEDIATE",
      totalGrade: "10.00",
      questionCount: 3,
      origin: "MANUAL",
      status: "DRAFT",
      archivedFromStatus: null,
      version: 1,
      humanReviewed: false,
      humanEdited: false,
      reviewedBy: null,
      reviewedAt: null,
      generationRequestId: null,
      warnings: [],
    });
    const [open, choice, program] = res.body.questions;
    expect(
      res.body.questions.map(
        (q: {
          position: number;
          type: string;
          gradingStrategy: string;
          value: string;
        }) => [q.position, q.type, q.gradingStrategy, q.value],
      ),
    ).toEqual([
      [0, "OPEN_ANSWER", "AI_REVIEW", "3.34"],
      [1, "MULTIPLE_CHOICE", "EXACT_MATCH", "3.33"],
      [2, "CODE", "TEST_CASES", "3.33"],
    ]);
    expect(open).toMatchObject({
      expectedAnswer: "Reuso de comportamento de uma superclasse.",
      rubric: "Cita superclasse e reuso.",
      explanation: "Reuso de comportamento.",
    });
    expect(choice.isTrickQuestion).toBe(false);
    expect(
      choice.alternatives.map(
        (a: { position: number; text: string; isCorrect: boolean }) => [
          a.position,
          a.text,
          a.isCorrect,
        ],
      ),
    ).toEqual([
      [0, "extends", true],
      [1, "implements", false],
      [2, "inherits", false],
    ]);
    expect(program).toMatchObject({
      language: { id: java, name: "Java" },
      starterCode: "class Cachorro {}",
      instructions: "Cachorro deve estender Animal.",
    });
    expect(
      program.testCases.map((c: { position: number; visibility: string }) => [
        c.position,
        c.visibility,
      ]),
    ).toEqual([
      [0, "PUBLIC"],
      [1, "PRIVATE"],
    ]);

    const row = await t.prisma.work.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(row).toMatchObject({
      teacherId: teacher.id,
      origin: "MANUAL",
      titleSearchKey: "trabalho de heranca",
      questionCount: 3,
    });
    expect(row.totalGrade.toFixed(2)).toBe("10.00");
    const stored = await t.prisma.workQuestion.findMany({
      where: { workId: res.body.id },
      orderBy: { position: "asc" },
    });
    expect(
      stored.map((q) => [q.value.toFixed(2), q.statementSearchKey]),
    ).toEqual([
      ["3.34", "o que e heranca?"],
      ["3.33", "qual palavra-chave declara heranca em java?"],
      ["3.33", "implemente a classe cachorro."],
    ]);

    const [event, ...others] = await t.prisma.auditEvent.findMany({
      where: { type: { startsWith: "work" } },
    });
    expect(others).toEqual([]);
    expect(event).toMatchObject({
      type: "work.created",
      actorType: "USER",
      actorUserId: teacher.id,
      targetType: "WORK",
      targetId: res.body.id,
    });
    expect(event!.requestId).not.toBeNull();
    expect(event!.metadata).toEqual({
      subjectId: syllabus.subject.id,
      status: "DRAFT",
      questionCount: 3,
      types: { OPEN_ANSWER: 1, MULTIPLE_CHOICE: 1, CODE: 1 },
      topicCount: 0,
      difficulty: "INTERMEDIATE",
    });
  });

  it("011/US1-1 salvar e aprovar registra o revisor e audita a criação e a aprovação, sem textos", async () => {
    const res = await create({ status: "APPROVED" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "APPROVED",
      humanReviewed: true,
      reviewedBy: { name: "Professora Ana" },
    });
    expect(res.body.reviewedAt).not.toBeNull();
    const row = await t.prisma.work.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(row.reviewedById).toBe(teacher.id);

    const events = await t.prisma.auditEvent.findMany({
      where: { type: { startsWith: "work" } },
      orderBy: { id: "asc" },
    });
    expect(events.map((e) => e.type)).toEqual([
      "work.created",
      "work.approved",
    ]);
    expect(events[1]!.metadata).toEqual({
      origin: "MANUAL",
      humanEdited: false,
      generationRequestId: null,
      warnings: [],
    });
    const audited = JSON.stringify(events.map((e) => e.metadata));
    for (const text of ["herança", "extends", "Cachorro", "Reuso", "Entregar"])
      expect(audited).not.toContain(text);
  });

  it("011/US1-1 salvar e aprovar com questão de código sem casos de teste guarda o aviso na aprovação", async () => {
    const res = await create({
      status: "APPROVED",
      questions: [openAnswer(), code(java, { testCases: [] })],
    });

    expect(res.status).toBe(201);
    expect(res.body.warnings).toEqual([
      { code: "CODE_QUESTION_WITHOUT_TEST_CASES", positions: [1] },
    ]);
    const approved = await t.prisma.auditEvent.findFirstOrThrow({
      where: { type: "work.approved" },
    });
    expect(approved.metadata).toMatchObject({
      warnings: ["CODE_QUESTION_WITHOUT_TEST_CASES"],
    });
  });

  it("011/US1-2 0 e 11 questões são recusadas sem gravar nada", async () => {
    for (const count of [0, 11]) {
      const res = await create({ questions: questions(count) });
      expect(res.status, `${count} questões`).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    }
    await nothingWritten();
  });

  it("011/US1-2 1 e 10 questões são aceitas (sem o mínimo de 3 do Banco de Exercícios)", async () => {
    const one = await create({ questions: questions(1), totalGrade: "0.01" });
    expect(one.status).toBe(201);
    expect(one.body.questions.map((q: { value: string }) => q.value)).toEqual([
      "0.01",
    ]);

    const ten = await create({ questions: questions(10), totalGrade: "1" });
    expect(ten.status).toBe(201);
    expect(ten.body.questionCount).toBe(10);
    expect(
      ten.body.questions.map((q: { position: number }) => q.position),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(
      ten.body.questions.every((q: { value: string }) => q.value === "0.10"),
    ).toBe(true);
  });

  it("011/US1-3 Múltipla escolha com 2 ou 6 alternativas, repetidas, nenhuma ou duas corretas recusa o trabalho inteiro, indicando a questão", async () => {
    const wrong = (text: string) => ({ text, isCorrect: false });
    const invalid = {
      "2 alternativas": [ALTERNATIVES[0]!, wrong("b")],
      "6 alternativas": [
        ALTERNATIVES[0]!,
        wrong("b"),
        wrong("c"),
        wrong("d"),
        wrong("e"),
        wrong("f"),
      ],
      repetidas: [ALTERNATIVES[0]!, wrong("Implements"), wrong(" implements ")],
      "nenhuma correta": [wrong("a"), wrong("b"), wrong("c")],
      "duas corretas": [
        { text: "a", isCorrect: true },
        { text: "b", isCorrect: true },
        wrong("c"),
      ],
    };
    for (const [label, alternatives] of Object.entries(invalid)) {
      const questionsBody = [openAnswer(), multipleChoice(alternatives)];
      const res = await create({ questions: questionsBody });
      expect(res.status, label).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      // The form shows the question and the rule from the same contract the server applies.
      const parsed = CreateWorkRequestSchema.safeParse(
        body({ questions: questionsBody }),
      );
      expect(parsed.success, label).toBe(false);
      expect(
        parsed.error!.issues.every(
          (issue) => issue.path[0] === "questions" && issue.path[1] === 1,
        ),
        label,
      ).toBe(true);
    }
    await nothingWritten();
  });

  it("011/US1-3 3 a 5 alternativas distintas com exatamente uma correta são aceitas, na ordem dada", async () => {
    const five = [
      ...ALTERNATIVES,
      { text: "super", isCorrect: false },
      { text: "this", isCorrect: false },
    ];
    const res = await create({
      questions: [
        multipleChoice(ALTERNATIVES),
        multipleChoice(five, { isTrickQuestion: true }),
      ],
    });

    expect(res.status).toBe(201);
    expect(
      res.body.questions[1].alternatives.map((a: { text: string }) => a.text),
    ).toEqual(["extends", "implements", "inherits", "super", "this"]);
    expect(res.body.questions[1].isTrickQuestion).toBe(true);
  });

  it("011/US1-4 Pergunta e resposta sem resposta esperada é recusada: toda questão nasce com gabarito", async () => {
    for (const expectedAnswer of [undefined, "", "   "]) {
      const res = await create({ questions: [openAnswer({ expectedAnswer })] });
      expect(res.status, JSON.stringify(expectedAnswer)).toBe(400);
    }
    await nothingWritten();
  });

  it("011/US1-4 código sem solução esperada, sem linguagem, com linguagem desconhecida ou inativa é recusado", async () => {
    await withInactivePython(async (inactive) => {
      const cases = {
        "sem solução": code(java, { expectedSolution: undefined }),
        "solução vazia": code(java, { expectedSolution: " " }),
        "sem linguagem": code(undefined),
        "linguagem desconhecida": code("0d4e5f60-7a8b-4c9d-8e0f-112233445566"),
        "linguagem inativa": code(inactive),
      };
      for (const [label, question] of Object.entries(cases)) {
        const res = await create({ questions: [openAnswer(), question] });
        expect(res.status, label).toBe(400);
        expect(res.body.code, label).toBe("VALIDATION_ERROR");
      }
    });
    await nothingWritten();
  });

  it("011/US1-4 caso de teste com entrada e saída vazias é aceito", async () => {
    const res = await create({
      questions: [
        code(java, {
          testCases: [{ input: "", expectedOutput: "", visibility: "PUBLIC" }],
        }),
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.questions[0].testCases).toEqual([
      expect.objectContaining({
        input: "",
        expectedOutput: "",
        visibility: "PUBLIC",
      }),
    ]);
  });

  it("011/US1-5 sem dificuldade e sem tópicos é aceito", async () => {
    const res = await create({
      difficulty: undefined,
      description: undefined,
      topics: null,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      difficulty: null,
      description: null,
      syllabusRevisionId: null,
      topics: [],
    });
  });

  it("011/US1-5 com tópicos da revisão confirmada: gravados na ordem escolhida, e as questões apontam para eles", async () => {
    const [heranca, polimorfismo, , listas] = syllabus.itemIds;
    const res = await create({
      topics: {
        syllabusRevisionId: syllabus.revision.id,
        syllabusItemIds: [listas, heranca, polimorfismo],
      },
      questions: [
        openAnswer({ topicItemIds: [heranca, polimorfismo] }),
        multipleChoice(ALTERNATIVES, { topicItemIds: [listas] }),
        code(java),
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.syllabusRevisionId).toBe(syllabus.revision.id);
    expect(res.body.topics).toEqual([
      { syllabusItemId: listas, itemText: "Listas", groupTitle: "Coleções" },
      {
        syllabusItemId: heranca,
        itemText: "Herança",
        groupTitle: "Orientação a objetos",
      },
      {
        syllabusItemId: polimorfismo,
        itemText: "Polimorfismo",
        groupTitle: "Orientação a objetos",
      },
    ]);
    expect(
      res.body.questions.map((q: { topicItemIds: string[] }) =>
        [...q.topicItemIds].sort(),
      ),
    ).toEqual([[heranca, polimorfismo].sort(), [listas], []]);
    const created = await t.prisma.auditEvent.findFirstOrThrow({
      where: { type: "work.created" },
    });
    expect(created.metadata).toMatchObject({ topicCount: 3 });
  });

  it("011/US1-5 tópico de outra disciplina, de outro professor ou inexistente → 404 sem revelar; revisão em rascunho → 422", async () => {
    const otherSubject = await createConfirmedSyllabus(t, teacher.id);
    const otherTeacher = await createUser(t, { roles: ["TEACHER"] });
    const foreign = await createConfirmedSyllabus(t, otherTeacher.id);
    const topics = (revisionId: string, itemIds: string[]) => ({
      topics: { syllabusRevisionId: revisionId, syllabusItemIds: itemIds },
    });

    const refused = {
      "outra disciplina": topics(otherSubject.revision.id, [
        otherSubject.itemIds[0]!,
      ]),
      "item de outra disciplina na revisão do trabalho": topics(
        syllabus.revision.id,
        [otherSubject.itemIds[0]!],
      ),
      "outro professor": topics(foreign.revision.id, [foreign.itemIds[0]!]),
      inexistente: topics(syllabus.revision.id, [
        "0d4e5f60-7a8b-4c9d-8e0f-112233445566",
      ]),
      "disciplina de outro professor": { subjectId: foreign.subject.id },
    };
    const responses = [];
    for (const [label, overrides] of Object.entries(refused)) {
      const res = await create(overrides);
      expect(res.status, label).toBe(404);
      responses.push(res.body);
    }
    expect(new Set(responses.map((r) => JSON.stringify(r))).size).toBe(1);

    const draft = await t.prisma.syllabusRevision.create({
      data: {
        documentId: syllabus.document.id,
        number: 2,
        status: "DRAFT",
        source: "MANUAL",
      },
    });
    const group = await t.prisma.syllabusGroup.create({
      data: { revisionId: draft.id, position: 1, title: null },
    });
    const item = await t.prisma.syllabusItem.create({
      data: {
        revisionId: draft.id,
        groupId: group.id,
        position: 1,
        text: "Rascunho",
      },
    });
    const res = await create(topics(draft.id, [item.id]));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("REVISION_NOT_CONFIRMED");
    await nothingWritten();
  });

  it("011/US1-5 tópico da questão fora dos tópicos do trabalho é recusado", async () => {
    const [heranca, polimorfismo] = syllabus.itemIds;
    const res = await create({
      topics: {
        syllabusRevisionId: syllabus.revision.id,
        syllabusItemIds: [heranca],
      },
      questions: [openAnswer({ topicItemIds: [polimorfismo] })],
    });
    expect(res.status).toBe(400);
    await nothingWritten();
  });

  it("011/US1-6 nenhuma criação manual, aceita ou recusada, cria execução de IA nem registra custo", async () => {
    expect((await create()).status).toBe(201);
    expect((await create({ status: "APPROVED" })).status).toBe(201);
    expect((await create({ questions: [] })).status).toBe(400);

    expect(await t.prisma.aiExecution.count()).toBe(0);
    expect(await t.prisma.aiModelCall.count()).toBe(0);
    expect(await t.prisma.workGenerationRequest.count()).toBe(0);
  });

  it("011/FR-010 origem, situação arquivada, valores, revisor e campos desconhecidos no corpo → 400", async () => {
    const extras = [
      { origin: "AI_GENERATED" },
      { status: "ARCHIVED" },
      { teacherId: teacher.id },
      { humanReviewed: true },
      { questions: [{ ...openAnswer(), value: "10" }] },
      { questions: [{ ...openAnswer(), gradingStrategy: "EXACT_MATCH" }] },
      { questions: [{ ...openAnswer(), isTrickQuestion: true }] },
    ];
    for (const extra of extras)
      expect((await create(extra)).status, JSON.stringify(extra)).toBe(400);
    await nothingWritten();
  });

  describe("GET /works/:id e GET /works/programming-languages", () => {
    it("011/US1-1 o professor lê o próprio trabalho; o de outro professor ou inexistente → 404", async () => {
      const created = await create({ status: "APPROVED" });
      const read = await client.get(`/api/works/${created.body.id}`);
      expect(read.status).toBe(200);
      expect(read.body).toEqual(created.body);

      const other = await createUser(t, { roles: ["TEACHER"] });
      const otherClient = api(t, { cookie: await loginAs(t, other) });
      const foreign = await otherClient.get(`/api/works/${created.body.id}`);
      const missing = await otherClient.get(
        "/api/works/0d4e5f60-7a8b-4c9d-8e0f-112233445566",
      );
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual(missing.body);
      expect((await client.get("/api/works/nao-e-uuid")).status).toBe(400);
    });

    it("011/FR-007 o catálogo de linguagens traz só as ativas, por nome", async () => {
      await withInactivePython(async () => {
        const res = await client.get("/api/works/programming-languages");

        expect(res.status).toBe(200);
        const names = res.body.map(
          (language: { name: string }) => language.name,
        );
        expect(names).toContain("Java");
        expect(names).not.toContain("Python");
        const active = await t.prisma.programmingLanguage.findMany({
          where: { active: true },
          select: { id: true, key: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        });
        expect(res.body).toEqual(active);
      });
    });
  });
});
