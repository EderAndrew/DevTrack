import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { READ_WORK_HELP_REQUEST } from "../../src/modules/work-help/definitions/request-content";
import { type CreatedActivity, createActivity, saveAnswers, startAttempt } from "../helpers/activities";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { DAY } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";
import { createWorkHelpApp, getHelp, requestHelp, scriptHelp, validGuidance } from "../helpers/work-help";

/**
 * 015/SC-011, 015/SC-008, 015/FR-018, 015/FR-028: the `work-helper` sees only what the student
 * sees. Every sensitive field of the snapshot carries a marker — the expected answer, the
 * expected solution, the explanation, the rubric and a private test case — and so does the
 * student's identity; for the three question types, none reaches what the provider received
 * (instructions, context, untrusted content, tool results), and none reaches a response to the
 * student. The correct alternative's flag never travels either: the alternatives go by letter only.
 */

const ANSWER = "MARCADOR-RESPOSTA-012";
const SOLUTION = "MARCADOR-SOLUCAO-012";
const EXPLANATION = "MARCADOR-EXPLICACAO-012";
const RUBRIC = "MARCADOR-RUBRICA-012";
const PRIVATE = "MARCADOR-PRIVADO-012";
const KEY_MARKERS = [ANSWER, SOLUTION, EXPLANATION, RUBRIC, PRIVATE];
const NAME = "Aluna MARCADOR-NOME-015";
const EMAIL = "marcador-email-015@example.com";

describe("015/SC-011 015/SC-008 015/FR-028 o gabarito nunca chega à IA nem ao aluno pela ajuda", () => {
  let t: AiTestApp;
  let student: TestUser;
  let client: ReturnType<typeof api>;
  let activity: CreatedActivity;

  beforeAll(async () => {
    t = await createWorkHelpApp({ config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, workHelpPerHour: 100 } } });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    student = await createUser(t, { roles: ["STUDENT"], name: NAME, email: EMAIL });
    const schoolClass = await createClass(t, teacher.id);
    await createEnrollment(t, schoolClass.id, student.id);
    client = api(t, { cookie: await loginAs(t, student) });
    activity = await createActivity(t, schoolClass, {
      publishAt: new Date(Date.now() - DAY),
      deadline: new Date(Date.now() + 7 * DAY),
      aiHelpAllowance: 3,
      questions: [
        {
          type: "MULTIPLE_CHOICE",
          statement: "Qual conceito protege o estado interno de um objeto?",
          alternatives: ["Encapsulamento", "Herança", "Polimorfismo"],
          correctIndex: 0,
          explanation: `${EXPLANATION} encapsulamento esconde o estado`,
          isTrickQuestion: true,
        },
        {
          type: "OPEN_ANSWER",
          statement: "Explique por que o saldo deve ser privado.",
          expectedAnswer: `${ANSWER} para validar as alterações`,
          rubric: `${RUBRIC} cite validação`,
          explanation: `${EXPLANATION} a classe controla o estado`,
        },
        {
          type: "CODE",
          statement: "Some os números da lista.",
          instructions: "Implemente somar.",
          starterCode: "int somar(int[] numeros) {\n}",
          expectedSolution: `// ${SOLUTION}\nint total = 0;`,
          explanation: `${EXPLANATION} percorra a lista`,
          testCases: [
            { input: "1 2", expectedOutput: "3", visibility: "PUBLIC" },
            { input: `${PRIVATE} 5`, expectedOutput: `${PRIVATE} 5`, visibility: "PRIVATE" },
          ],
        },
      ],
    });
    expect((await startAttempt(client, activity.activity.id)).status).toBe(200);
  });

  it.each([
    [0, "MULTIPLE_CHOICE"],
    [1, "OPEN_ANSWER"],
    [2, "CODE"],
  ] as const)("questão %i (%s): o que o provedor recebeu tem a questão, mas nenhum marcador do gabarito, da identidade ou ids", async (position, type) => {
    const questionId = activity.questionIds[position]!;
    if (type === "MULTIPLE_CHOICE") {
      await saveAnswers(client, activity.activity.id, [{ questionId, answer: { kind: "ALTERNATIVE", alternativeId: activity.alternativeIds[0]![1]! }, baseRevision: 0 }]);
    }
    const res = await requestHelp(client, activity.activity.id, { questionId, question: "Por onde começo?" });
    expect(res.status).toBe(202);
    scriptHelp(t.provider, res.body.id, validGuidance());
    await drain(t);

    expect(t.provider.requests.length).toBeGreaterThanOrEqual(2);
    const sent = JSON.stringify(t.provider.requests);
    for (const marker of [...KEY_MARKERS, NAME, EMAIL, student.id, activity.activity.id, questionId, ...activity.alternativeIds.flat()]) {
      expect(sent, marker).not.toContain(marker);
    }
    expect(sent).not.toMatch(/isCorrect|expectedAnswer|expectedSolution|rubric|isTrickQuestion|"explanation"/);
    // The tool result is what the student sees of the question, in the untrusted block.
    const tool = t.provider.requests.at(-1)!.history.find((entry) => entry.role === "tool");
    expect(tool).toMatchObject({ toolKey: READ_WORK_HELP_REQUEST });
    const text = tool!.role === "tool" ? tool!.content.text : "";
    expect(text).toContain(`"questionType":"${type}"`);
    if (type === "MULTIPLE_CHOICE") {
      expect(text).toContain('{"label":"A","text":"Encapsulamento"}');
      expect(text).toContain('"studentAnswer":{"label":"B"}');
    }
    if (type === "CODE") expect(text).toContain('"publicTestCases":[{"input":"1 2","expectedOutput":"3"}]');
  });

  it("015/SC-008 nenhuma resposta ao aluno (pedido, estado, atividade) traz gabarito ou o contexto enviado à IA", async () => {
    const bodies: unknown[] = [];
    for (const questionId of activity.questionIds) {
      const res = await requestHelp(client, activity.activity.id, { questionId, question: "Me ajuda?" });
      bodies.push(res.body);
      scriptHelp(t.provider, res.body.id, validGuidance());
      await drain(t);
    }
    bodies.push((await getHelp(client, activity.activity.id)).body);
    bodies.push((await client.get(`/api/me/activities/${activity.activity.id}`)).body);
    const text = JSON.stringify(bodies);
    for (const marker of KEY_MARKERS) expect(text, marker).not.toContain(marker);
    expect(text).not.toMatch(/executionId|aiExecutionId|reasonCode|previousGuidance|studentQuestion/);
  });
});
