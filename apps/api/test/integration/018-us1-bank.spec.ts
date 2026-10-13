import type { TeacherExam } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { approvedExam, examBody, postExam, toExamUpdateBody } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus } from "../helpers/works";

/**
 * 018/US1 — the teacher creates an exam by hand in the Banco de Provas: 1–20 questions of the 011
 * types, each with its key, a difficulty and 1–3 topics; values computed from the total; DRAFT until
 * approved by a person; no AI involved (018/FR-001–FR-004, FR-006).
 */
describe("018/US1 professor cria uma prova manualmente", () => {
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

  const audits = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  it("018/US1-1 018/FR-003 três questões e nota 10,00: rascunho com 3,34, 3,33 e 3,33, criação auditada sem conteúdo", async () => {
    const created = await postExam(client, await examBody(t, syllabus));
    expect(created.status).toBe(201);
    const exam = created.body as TeacherExam;
    expect(exam).toMatchObject({ status: "DRAFT", origin: "MANUAL", totalGrade: "10.00", questionCount: 3, humanReviewed: false });
    expect(exam.questions.map((question) => question.value)).toEqual(["3.34", "3.33", "3.33"]);
    expect(exam.questions.map((question) => question.difficulty)).toEqual(["BASIC", "INTERMEDIATE", "ADVANCED"]);
    expect(exam.questions.every((question) => question.topicIds.join() === syllabus.itemIds[0])).toBe(true);
    expect(exam.topics.map((topic) => topic.syllabusItemId)).toEqual([syllabus.itemIds[0]]);

    const [event] = await audits("exam.created");
    expect(event).toMatchObject({ actorType: "USER", actorUserId: teacher.id, targetType: "EXAM", targetId: exam.id });
    expect(event!.metadata).toEqual({ subjectId: syllabus.subject.id, origin: "MANUAL", status: "DRAFT", questionCount: 3 });
    expect(JSON.stringify(event!.metadata)).not.toMatch(/herança|extends|Soma/i);
  });

  it("018/FR-006 nenhuma execução de IA é criada pelo banco", async () => {
    const exam = await approvedExam(t, client, syllabus);
    expect(exam.status).toBe("APPROVED");
    expect(await t.prisma.aiExecution.count()).toBe(0);
  });

  it("018/US1-2 018/FR-004 aprovar sem dificuldade é recusado apontando a questão; com tudo, aprova e audita", async () => {
    const body = await examBody(t, syllabus);
    body.questions[1] = { ...body.questions[1]!, difficulty: null };
    const draft = (await postExam(client, body)).body as TeacherExam;
    expect(draft.questions[1]!.difficulty).toBeNull();

    const refused = await client.post(`/api/exams/${draft.id}/approve`, { version: draft.version });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ code: "EXAM_RULES", details: { violations: [{ position: 1, field: "difficulty", reason: "DIFFICULTY_MISSING" }] } });
    expect(await audits("exam.approved")).toHaveLength(0);

    // "Salvar e aprovar" refuses the same, before writing anything.
    const direct = await postExam(client, { ...body, saveAs: "APPROVED" });
    expect(direct.status).toBe(422);
    expect(direct.body.details.violations).toEqual([{ position: 1, field: "difficulty", reason: "DIFFICULTY_MISSING" }]);

    const fixed = toExamUpdateBody(draft);
    fixed.questions[1] = { ...fixed.questions[1]!, difficulty: "BASIC" };
    const edited = await client.put(`/api/exams/${draft.id}`, fixed);
    expect(edited.status).toBe(200);
    const approved = await client.post(`/api/exams/${draft.id}/approve`, { version: edited.body.version });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ status: "APPROVED", humanReviewed: true, reviewedBy: { name: teacher.name } });
    expect((await audits("exam.approved")).map((event) => event.metadata)).toEqual([{ origin: "MANUAL", humanEdited: false }]);

    // Already APPROVED: the exam as it is, no second event.
    expect((await client.post(`/api/exams/${draft.id}/approve`, { version: approved.body.version })).status).toBe(200);
    expect(await audits("exam.approved")).toHaveLength(1);
  });

  it("018/US1-2 018/FR-001 a regra de estrutura da 011 aponta a questão e o campo: múltipla escolha sem uma correta", async () => {
    const body = await examBody(t, syllabus);
    const response = await client.post("/api/exams", {
      ...body,
      questions: [body.questions[0], { ...body.questions[1], alternatives: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: true }, { text: "c", isCorrect: false }] }],
    });
    // The contract's refinement catches it first: the body never reaches the rules.
    expect(response.status).toBe(400);
    expect(await t.prisma.exam.count()).toBe(0);
  });

  it("018/US1-3 018/FR-001 0 ou 21 questões são recusadas pelo servidor; 20 cabem", async () => {
    const body = await examBody(t, syllabus);
    const one = body.questions[0]!;
    expect((await postExam(client, { ...body, questions: [] })).status).toBe(400);
    expect((await postExam(client, { ...body, totalGrade: "21.00", questions: Array.from({ length: 21 }, () => one) })).status).toBe(400);
    const twenty = await postExam(client, { ...body, totalGrade: "20.00", questions: Array.from({ length: 20 }, () => one) });
    expect(twenty.status).toBe(201);
    expect((twenty.body as TeacherExam).questions.every((question) => question.value === "1.00")).toBe(true);
    expect(await t.prisma.exam.count()).toBe(1);
  });

  it("018/FR-002 os tópicos são de uma revisão confirmada da disciplina do professor, e os da questão, da prova", async () => {
    const body = await examBody(t, syllabus);
    // A topic of the question outside the exam's topics: the contract refuses it.
    expect((await postExam(client, { ...body, questions: [{ ...body.questions[0]!, topicIds: [syllabus.itemIds[1]!] }] })).status).toBe(400);
    // Another teacher's syllabus, another subject's revision or an unknown item: the same 404.
    const other = await createConfirmedSyllabus(t, (await createUser(t, { roles: ["TEACHER"] })).id);
    expect((await postExam(client, { ...body, subjectId: other.subject.id })).status).toBe(404);
    expect((await postExam(client, { ...body, syllabusRevisionId: other.revision.id })).status).toBe(404);
    expect((await postExam(client, { ...body, topicIds: [other.itemIds[0]!], questions: body.questions.map((q) => ({ ...q, topicIds: [other.itemIds[0]!] })) })).status).toBe(404);
  });

  it.todo("018/US1-4 a prova aprovada editada vale para as próximas aplicações; nenhuma prova já aplicada muda (T018)");

  it("018/US1-4 a prova aprovada pode ser editada e continua aprovada; a edição é auditada só com nomes de campo", async () => {
    const exam = await approvedExam(t, client, syllabus);
    const body = toExamUpdateBody(exam);
    body.totalGrade = "9.00";
    body.questions = body.questions.slice(0, 2);
    const edited = await client.put(`/api/exams/${exam.id}`, body);
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ status: "APPROVED", totalGrade: "9.00", questionCount: 2 });
    expect(edited.body.questions.map((question: { value: string }) => question.value)).toEqual(["4.50", "4.50"]);
    expect((await audits("exam.edited")).map((event) => event.metadata)).toEqual([{ fields: ["totalGrade", "questions"], questionCountChanged: true }]);

    // An APPROVED exam keeps its approval rules: a question without difficulty is refused.
    const broken = toExamUpdateBody(edited.body as TeacherExam);
    broken.questions[0] = { ...broken.questions[0]!, difficulty: null };
    expect((await client.put(`/api/exams/${exam.id}`, broken)).body).toMatchObject({ code: "EXAM_RULES", details: { violations: [{ position: 0 }] } });
    // The same exam again: nothing changes, no event.
    expect((await client.put(`/api/exams/${exam.id}`, toExamUpdateBody(edited.body as TeacherExam))).status).toBe(200);
    expect(await audits("exam.edited")).toHaveLength(1);
  });

  it("018/FR-004 versão desatualizada → 409; arquivada não se edita nem se aprova; restaurar volta à situação de antes", async () => {
    const exam = await approvedExam(t, client, syllabus);
    expect((await client.put(`/api/exams/${exam.id}`, { ...toExamUpdateBody(exam), version: exam.version - 1 })).body.code).toBe("EXAM_VERSION_CONFLICT");
    const archived = await client.post(`/api/exams/${exam.id}/archive`, { version: exam.version });
    expect(archived.body).toMatchObject({ status: "ARCHIVED", archivedFromStatus: "APPROVED" });
    expect((await client.put(`/api/exams/${exam.id}`, toExamUpdateBody(archived.body as TeacherExam))).body.code).toBe("EXAM_ARCHIVED");
    expect((await client.post(`/api/exams/${exam.id}/approve`, { version: archived.body.version })).body.code).toBe("EXAM_ARCHIVED");
    expect((await client.get("/api/exams")).body.items).toHaveLength(0);
    expect((await client.get("/api/exams?status=ARCHIVED")).body.items).toHaveLength(1);
    const restored = await client.post(`/api/exams/${exam.id}/restore`, { version: archived.body.version });
    expect(restored.body).toMatchObject({ status: "APPROVED", archivedFromStatus: null });
    expect((await client.post(`/api/exams/${exam.id}/restore`, { version: restored.body.version })).body.code).toBe("INVALID_STATE_TRANSITION");
    expect((await audits("exam.archived")).map((event) => event.metadata)).toEqual([{ fromStatus: "APPROVED" }]);
    expect((await audits("exam.restored")).map((event) => event.metadata)).toEqual([{ fromStatus: "ARCHIVED" }]);
  });

  it("018/FR-001 a lista do banco filtra por situação, disciplina e busca sem acento, e pagina por cursor", async () => {
    await postExam(client, await examBody(t, syllabus, { title: "Avaliação de Herança" }));
    await approvedExam(t, client, syllabus);
    const other = await createConfirmedSyllabus(t, teacher.id);
    await postExam(client, await examBody(t, other, { title: "Prova de coleções" }));

    expect((await client.get("/api/exams")).body.items).toHaveLength(3);
    expect((await client.get("/api/exams?q=avaliacao%20de%20heranca")).body.items.map((item: { title: string }) => item.title)).toEqual(["Avaliação de Herança"]);
    expect((await client.get(`/api/exams?subjectId=${other.subject.id}`)).body.items).toHaveLength(1);
    expect((await client.get("/api/exams?status=APPROVED")).body.items).toHaveLength(1);
    const first = await client.get("/api/exams?limit=2");
    expect(first.body.items).toHaveLength(2);
    const second = await client.get(`/api/exams?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    expect(second.body).toMatchObject({ nextCursor: null });
    expect(second.body.items).toHaveLength(1);
  });

  it("018/US1-5 outro professor não vê, não edita, não aprova nem arquiva a prova: 404", async () => {
    const exam = await approvedExam(t, client, syllabus);
    const other = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["TEACHER"] })) });
    expect((await other.get(`/api/exams/${exam.id}`)).status).toBe(404);
    expect((await other.get(`/api/exams/${exam.id}/student-preview`)).status).toBe(404);
    expect((await other.put(`/api/exams/${exam.id}`, toExamUpdateBody(exam))).status).toBe(404);
    expect((await other.post(`/api/exams/${exam.id}/approve`, { version: exam.version })).status).toBe(404);
    expect((await other.post(`/api/exams/${exam.id}/archive`, { version: exam.version })).status).toBe(404);
    expect((await other.get("/api/exams")).body.items).toHaveLength(0);
  });
});
