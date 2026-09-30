import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { READ_WORK_GENERATION_REQUEST } from "../../src/modules/work-ai/generation/request-content";
import { fakeOutput, fakeText, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { validGeneratedWork } from "../fixtures/work-generation/valid-work";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { createClass, createUser, loginAs, type TestUser } from "../helpers/factories";
import { testConfig } from "../helpers/test-app";
import { createWorkAiApp, requestWork, scriptWorkGeneration, workGenerationRequest } from "../helpers/work-ai";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 011/FR-025, 011/FR-026, research W12: `read-work-generation-request` gives the model only the
 * selected topics (as refs T1…), their group titles, the revision's title, competency and language
 * and the configuration of the execution's own request — never the work's title, description or
 * grade, the subject's name, other items, user ids, classes or students — and refuses any other
 * request.
 */
describe("011/FR-025 011/FR-026 escopo da ferramenta read-work-generation-request", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;

  beforeAll(async () => {
    t = await createWorkAiApp({ config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, workAiPerHour: 100 } } });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora MARCADOR-PROFESSORA-011" });
    cookie = await loginAs(t, teacher);
  });

  it("devolve só os itens do pedido (com ref), os grupos, o título, a competência, a linguagem e a configuração", async () => {
    const syllabus = await createConfirmedSyllabus(t, teacher.id, {
      competencyText: "Modelar sistemas orientados a objetos",
      groups: [
        { title: "Orientação a objetos", items: ["Herança", "Polimorfismo", "MARCADOR-OUTRO-ITEM-011"] },
        { title: "MARCADOR-OUTRO-GRUPO-011", items: ["MARCADOR-OUTRO-ITEM-B-011"] },
      ],
    });
    await t.prisma.subject.update({ where: { id: syllabus.subject.id }, data: { name: "MARCADOR-DISCIPLINA-011" } });
    await createClass(t, teacher.id, { name: "MARCADOR-TURMA-011" });

    const res = await requestWork(
      t,
      cookie,
      workGenerationRequest(syllabus, {
        syllabusItemIds: [syllabus.itemIds[0]!, syllabus.itemIds[1]!],
        title: "MARCADOR-TITULO-011",
        description: "MARCADOR-DESCRICAO-011",
        totalGrade: "7.77",
        total: 4,
        types: ["OPEN_ANSWER", "CODE"],
      }),
    );
    expect(res.status).toBe(202);
    scriptWorkGeneration(t.provider, res.body.id, validGeneratedWork({ difficulty: "INTERMEDIATE", counts: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 0, CODE: 2 }, trickQuestions: 0, language: "Java", topicCount: 2 }));
    await drain(t);

    const call = await t.prisma.aiToolCall.findFirstOrThrow({ where: { toolKey: READ_WORK_GENERATION_REQUEST } });
    expect(call.status).toBe("SUCCEEDED");
    // The tool's result, as the model received it (inside the untrusted block).
    const toolEntry = t.provider.requests.at(-1)!.history.find((entry) => entry.role === "tool" && entry.toolKey === READ_WORK_GENERATION_REQUEST);
    const text = toolEntry?.role === "tool" ? toolEntry.content.text : "";
    expect(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1))).toEqual({
      syllabus: { title: "Programação Orientada a Objetos", competency: "Modelar sistemas orientados a objetos", language: "Java" },
      topics: [
        { ref: "T1", itemText: "Herança", groupTitle: "Orientação a objetos" },
        { ref: "T2", itemText: "Polimorfismo", groupTitle: "Orientação a objetos" },
      ],
      request: { difficulty: "INTERMEDIATE", total: 4, counts: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 0, CODE: 2 }, trickQuestions: 0, language: "Java" },
    });
    // Every request to the model: the only data it saw.
    const seen = JSON.stringify(t.provider.requests);
    expect(seen).toContain("Herança");
    expect(seen).toContain("Polimorfismo");
    for (const forbidden of [
      "MARCADOR-TITULO-011",
      "MARCADOR-DESCRICAO-011",
      "7.77",
      "MARCADOR-DISCIPLINA-011",
      "MARCADOR-OUTRO-ITEM-011",
      "MARCADOR-OUTRO-ITEM-B-011",
      "MARCADOR-OUTRO-GRUPO-011",
      "MARCADOR-TURMA-011",
      "MARCADOR-PROFESSORA-011",
      teacher.id,
      teacher.email,
      syllabus.subject.id,
      ...syllabus.itemIds,
    ]) {
      expect(seen, forbidden).not.toContain(forbidden);
    }
  });

  it.each([
    ["de outra execução do mesmo professor", "own"],
    ["de outro professor", "other"],
  ] as const)("recusa o pedido %s: AI_CONTEXT_ACCESS_DENIED, e a geração falha sem trabalho", async (_, whose) => {
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const first = await requestWork(t, cookie, workGenerationRequest(syllabus));
    let foreignRequestId = first.body.id as string;
    if (whose === "other") {
      const other = await createUser(t, { roles: ["TEACHER"] });
      const otherSyllabus = await createConfirmedSyllabus(t, other.id);
      foreignRequestId = (await requestWork(t, await loginAs(t, other), workGenerationRequest(otherSyllabus))).body.id;
    }
    // The earlier generations end (an answer that is not JSON), so only the target's runs next.
    t.provider.script(fakeText("não é JSON"));
    await drain(t);
    t.provider.reset();
    const target = await requestWork(t, cookie, workGenerationRequest(syllabus));
    // The model asks for another request than its own.
    t.provider.script(fakeToolCall(READ_WORK_GENERATION_REQUEST, { requestId: foreignRequestId }), fakeOutput({ questions: [] }));
    await drain(t);

    const execution = await t.prisma.aiExecution.findFirstOrThrow({ where: { resourceId: target.body.id }, include: { toolCallRows: true } });
    expect(execution.toolCallRows.map((row) => [row.toolKey, row.status, row.errorCode])).toEqual([[READ_WORK_GENERATION_REQUEST, "DENIED", "AI_CONTEXT_ACCESS_DENIED"]]);
    expect(execution.status).toBe("FAILED");
    expect(await t.prisma.work.count()).toBe(0);
    expect((await t.prisma.workGenerationRequest.findUniqueOrThrow({ where: { id: target.body.id } })).generatedAt).toBeNull();
  });
});
