import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { feedbackFieldId, GENERAL_FEEDBACK_FIELD_ID, gradeFieldId } from "../schemas/attempt-grading";
import { AttemptReview, GRADING_CONFLICT_NOTICE } from "./attempt-review";
import { commentFieldId } from "../schemas/exercise-marks";
import {
  ACTIVITY_ID,
  ATTEMPT_ID,
  apiError,
  CLASS_ID,
  EXERCISE_ATTEMPT_ID,
  exerciseAttempt,
  gradingActivity,
  json,
  MARK_CHOICE_ID,
  MARK_CODE_ID,
  MARK_OPEN_ID,
  markingActivity,
  OPEN_QUESTION_ID,
  routedFetch,
  teacherAttempt,
} from "./test-fixtures";

const ACTIVITY_PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
const ATTEMPT_PATH = `${ACTIVITY_PATH}/attempts/${ATTEMPT_ID}`;
const field = (id: string) => document.getElementById(id) as HTMLInputElement;

function setup(routes: Parameters<typeof routedFetch>[0] = {}, canGrade = true, canMark = false) {
  const api = routedFetch({
    [`GET ${ACTIVITY_PATH}`]: json(200, gradingActivity()),
    [`GET ${ATTEMPT_PATH}`]: json(200, teacherAttempt()),
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} canGrade={canGrade} canMark={canMark} />);
  return { ...view, api, user: userEvent.setup() };
}

const decided = teacherAttempt({
  submission: {
    ...teacherAttempt().submission!,
    grade: "0.90",
    gradePartial: false,
    generalFeedback: "Muito bem.",
    version: 2,
    gradings: [
      teacherAttempt().submission!.gradings[0]!,
      {
        questionId: OPEN_QUESTION_ID,
        status: "DECIDED",
        nature: "HUMAN_DECISION",
        finalGrade: "0.40",
        teacherGrade: "0.40",
        pendingReason: null,
        feedback: "Faltou a interface pública.",
      },
    ],
  },
});

describe("012/US5 AttemptReview — respostas, gabarito, correção e aceite", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("012/US5-1 respostas ao lado do gabarito; MC marcada como corrigida automaticamente, aberta pendente", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Tentativa de Bruno Lima" })).toBeTruthy();
    const first = screen.getByRole("listitem", { name: "Questão 1" });
    expect(within(first).getByText("Corrigida automaticamente")).toBeTruthy();
    expect(within(first).getByText("extends").closest("li")!.textContent).toBe("extends (escolhida) (correta)");
    const second = screen.getByRole("listitem", { name: "Questão 2" });
    expect(within(second).getByText("Correção pendente")).toBeTruthy();
    expect(within(second).getByText("Proteger os atributos.")).toBeTruthy();
    expect(within(second).getByText("Esconder o estado atrás de métodos.")).toBeTruthy();
    expect(field(gradeFieldId(0)).value).toBe("0,50");
    expect(field(gradeFieldId(1)).value).toBe("");
    expect(screen.getAllByText("0,00 a 0,50")).toHaveLength(2);
    expect(screen.getByText("0,50 de 1,00 (parcial)")).toBeTruthy();
  });

  it("012/US5-2 salvar correção envia só a questão alterada e o feedback geral, na versão lida", async () => {
    const { api, user } = setup({ [`PUT ${ATTEMPT_PATH}/grades`]: json(200, decided) });
    await screen.findByRole("form", { name: "Correção" });
    await user.type(field(gradeFieldId(1)), "0,4");
    await user.type(field(feedbackFieldId(1)), "Faltou a interface pública.");
    await user.type(field(GENERAL_FEEDBACK_FIELD_ID), "Muito bem.");
    await user.click(screen.getByRole("button", { name: "Salvar correção" }));
    expect(await screen.findByText("Correção salva.")).toBeTruthy();
    expect(api.writes()[0]!.body).toEqual({
      version: 1,
      decisions: [{ questionId: OPEN_QUESTION_ID, grade: "0.40", feedback: "Faltou a interface pública." }],
      generalFeedback: "Muito bem.",
    });
    expect(screen.getByText("0,90 de 1,00")).toBeTruthy();
    expect(field(gradeFieldId(1)).value).toBe("0,40");
  });

  it("012/US5-3 nota acima do valor ou com três casas fica no campo, ligada à mensagem, e nada é enviado", async () => {
    const { api, user } = setup();
    await screen.findByRole("form", { name: "Correção" });
    await user.type(field(gradeFieldId(1)), "0,51");
    await user.click(screen.getByRole("button", { name: "Salvar correção" }));
    expectFieldErrorLinked(field(gradeFieldId(1)));
    expect(screen.getAllByText("Questão 2: a nota deve ficar de 0,00 a 0,50.").length).toBeGreaterThan(0);
    await user.clear(field(gradeFieldId(1)));
    await user.type(field(gradeFieldId(1)), "0,255");
    await user.click(screen.getByRole("button", { name: "Salvar correção" }));
    expectFieldErrorLinked(field(gradeFieldId(1)));
    expect(api.writes()).toEqual([]);
  });

  it("outra aba salvou antes: recarrega a correção e avisa", async () => {
    const { api, user } = setup({
      [`PUT ${ATTEMPT_PATH}/grades`]: apiError(409, "SUBMISSION_VERSION_CONFLICT", "Esta correção mudou em outra aba."),
    });
    await screen.findByRole("form", { name: "Correção" });
    await user.type(field(gradeFieldId(1)), "0,1");
    await user.click(screen.getByRole("button", { name: "Salvar correção" }));
    expect(await screen.findByText(GRADING_CONFLICT_NOTICE)).toBeTruthy();
    expect(api.calls.filter((call) => call.method === "GET" && call.url === ATTEMPT_PATH)).toHaveLength(2);
  });

  it("012/US5-6 não entregue: somente leitura, e quem não pode mais entregar tem Aceitar como entrega com confirmação", async () => {
    const missedId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
    const missedPath = `${ACTIVITY_PATH}/attempts/${missedId}`;
    const open = teacherAttempt({ id: missedId, status: "IN_PROGRESS", student: { userId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3", name: "Carla Dias" }, submission: null });
    const accepted = teacherAttempt({
      ...open,
      status: "SUBMITTED",
      submission: { ...teacherAttempt().submission!, late: true, acceptedByTeacher: true },
    });
    const api = routedFetch({
      [`GET ${ACTIVITY_PATH}`]: json(200, gradingActivity()),
      [`GET ${missedPath}`]: json(200, open),
      [`POST ${missedPath}/accept-submission`]: json(200, accepted),
    });
    vi.stubGlobal("fetch", api.fetch);
    renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={missedId} canGrade canMark={false} />);
    const user = userEvent.setup();

    expect(await screen.findByText("Não entregue")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Correção" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Aceitar como entrega" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Aceitar esta tentativa como entrega?" });
    expect(within(dialog).getByText(/As respostas salvas até .* viram a entrega deste aluno, marcada como atrasada\./)).toBeTruthy();
    expect(api.writes()).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Aceitar como entrega" }));
    expect(await screen.findByText("Entrega aceita.")).toBeTruthy();
    expect(api.writes().map((call) => [call.method, call.url, call.body])).toEqual([["POST", `${missedPath}/accept-submission`, {}]]);
    expect(screen.getByText("Entrega aceita pelo professor")).toBeTruthy();
    expect(screen.getByText("Entregue com atraso")).toBeTruthy();
  });

  it("aluno que ainda pode entregar não tem o aceite", async () => {
    const open = teacherAttempt({ submission: null, status: "IN_PROGRESS" });
    setup({ [`GET ${ATTEMPT_PATH}`]: json(200, open) });
    expect(await screen.findByText("Não entregue")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aceitar como entrega" })).toBeNull();
  });

  it("sem notas.lancar a correção aparece só para leitura", async () => {
    setup({ [`GET ${ATTEMPT_PATH}`]: json(200, decided) }, false);
    const second = await screen.findByRole("listitem", { name: "Questão 2" });
    expect(screen.queryByRole("form", { name: "Correção" })).toBeNull();
    expect(within(second).getByText("0,40 de 0,50")).toBeTruthy();
    expect(within(second).getByText("Faltou a interface pública.")).toBeTruthy();
  });

  it("aluno anterior e próximo pela lista da atividade", async () => {
    setup();
    const nav = await screen.findByRole("navigation", { name: "Outros alunos" });
    expect(within(nav).queryByText(/Aluno anterior/)).toBeNull();
    expect(within(nav).getByRole("link", { name: "Próximo aluno: Carla Dias" }).getAttribute("href")).toBe(
      `/turmas/${CLASS_ID}/atividades/${ACTIVITY_ID}/tentativas/dddddddd-dddd-4ddd-8ddd-ddddddddddd3`,
    );
  });

  it("012/US5-2 SC-012 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setup();
    await screen.findByRole("form", { name: "Correção" });
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      screen.getByRole("link", { name: "Voltar para Lista de herança" }),
      field(gradeFieldId(0)),
      field(feedbackFieldId(0)),
      field(gradeFieldId(1)),
      field(feedbackFieldId(1)),
      field(GENERAL_FEEDBACK_FIELD_ID),
      screen.getByRole("button", { name: "Salvar correção" }),
      screen.getByRole("link", { name: "Próximo aluno: Carla Dias" }),
    ]);
  });
});

const EXERCISE_ATTEMPT_PATH = `${ACTIVITY_PATH}/attempts/${EXERCISE_ATTEMPT_ID}`;
const radio = (position: number, label: "Certo" | "Errado") =>
  within(screen.getByRole("group", { name: `Correção do exercício ${position + 1}` })).getByRole("radio", { name: label }) as HTMLInputElement;

function setupExercise(routes: Parameters<typeof routedFetch>[0] = {}, canMark = true) {
  const api = routedFetch({
    [`GET ${ACTIVITY_PATH}`]: json(200, markingActivity()),
    [`GET ${EXERCISE_ATTEMPT_PATH}`]: json(200, exerciseAttempt()),
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(
    <AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={EXERCISE_ATTEMPT_ID} canGrade={false} canMark={canMark} />,
  );
  return { ...view, api, user: userEvent.setup() };
}

describe("013/US3 AttemptReview — Exercício: Certo ou Errado por resposta", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("013/US3-5 013/FR-016 resposta ao lado do gabarito; múltipla escolha automática; aberta e código com Certo/Errado e comentário; nenhum campo de nota", async () => {
    setupExercise();
    expect(await screen.findByRole("form", { name: "Correção" })).toBeTruthy();
    const choice = screen.getByRole("listitem", { name: "Exercício 1" });
    expect(within(choice).getByText("Certo")).toBeTruthy();
    expect(within(choice).getByText("Corrigido automaticamente")).toBeTruthy();
    expect(within(choice).queryByRole("radio")).toBeNull();
    const open = screen.getByRole("listitem", { name: "Exercício 2" });
    expect(within(open).getByText("Aguardando correção")).toBeTruthy();
    expect(within(open).getByText("Proteger os atributos.")).toBeTruthy();
    expect(within(open).getByText("Esconder o estado atrás de métodos.")).toBeTruthy();
    expect([radio(1, "Certo").checked, radio(1, "Errado").checked]).toEqual([false, false]);
    expect([radio(2, "Certo").checked, radio(2, "Errado").checked]).toEqual([false, true]);
    expect((document.getElementById(commentFieldId(2)) as HTMLTextAreaElement).value).toBe("Faltou o private.");
    expect(screen.getByLabelText("Comentário do exercício 2 (opcional)")).toBeTruthy();

    expect(screen.getByText("Vale 30 pontos")).toBeTruthy();
    expect(screen.getByText("15 de 105 pontos")).toBeTruthy();
    expect(screen.getByText("1 resposta aguardando correção")).toBeTruthy();
    for (const label of [/^Nota/, /Feedback geral/]) expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.queryByText(/Liberar resultado|Aceitar como entrega|Não entregue/)).toBeNull();
  });

  it("013/US3-1 013/FR-017 salvar correção envia só as marcações alteradas, com o comentário", async () => {
    const marked = exerciseAttempt({ [MARK_OPEN_ID]: { result: "CORRECT", points: 30, nature: "HUMAN_DECISION", comment: "Boa.", decidedAt: "2026-10-05T14:00:00.000Z" } });
    const { api, user } = setupExercise({ [`PUT ${EXERCISE_ATTEMPT_PATH}/marks`]: json(200, marked) });
    await screen.findByRole("form", { name: "Correção" });
    await user.click(radio(1, "Certo"));
    await user.type(document.getElementById(commentFieldId(1))!, "Boa.");
    await user.click(screen.getByRole("button", { name: "Salvar correção" }));
    expect(await screen.findByText("Correção salva.")).toBeTruthy();
    expect(api.writes().map((call) => [call.method, call.url, call.body])).toEqual([
      ["PUT", `${EXERCISE_ATTEMPT_PATH}/marks`, { marks: [{ questionId: MARK_OPEN_ID, result: "CORRECT", comment: "Boa." }] }],
    ]);
    expect(screen.getByText("45 de 105 pontos")).toBeTruthy();
    expect(radio(1, "Certo").checked).toBe(true);
  });

  it("013/US3-2 mudar uma marcação feita envia o novo resultado e o comentário atual; nada alterado não envia nada", async () => {
    const { api, user } = setupExercise({ [`PUT ${EXERCISE_ATTEMPT_PATH}/marks`]: json(200, exerciseAttempt()) });
    await screen.findByRole("form", { name: "Correção" });
    await user.click(screen.getByRole("button", { name: "Salvar correção" }));
    expect(await screen.findByText("Nenhuma alteração para salvar.")).toBeTruthy();
    expect(api.writes()).toEqual([]);

    await user.click(radio(2, "Certo"));
    await user.clear(document.getElementById(commentFieldId(2))!);
    await user.click(screen.getByRole("button", { name: "Salvar correção" }));
    await screen.findByText("Correção salva.");
    expect(api.writes()[0]!.body).toEqual({ marks: [{ questionId: MARK_CODE_ID, result: "CORRECT", comment: null }] });
  });

  it("013/FR-017 recusa do servidor aparece no resumo de erros", async () => {
    const { user } = setupExercise({ [`PUT ${EXERCISE_ATTEMPT_PATH}/marks`]: apiError(409, "INVALID_STATE_TRANSITION", "x") });
    await screen.findByRole("form", { name: "Correção" });
    await user.click(radio(1, "Errado"));
    await user.click(screen.getByRole("button", { name: "Salvar correção" }));
    expect(await screen.findByText("Não foi possível salvar a correção")).toBeTruthy();
  });

  it("013/FR-010a já pontuado em outra atividade: só leitura, sem Certo/Errado", async () => {
    const attempt = exerciseAttempt({ [MARK_OPEN_ID]: { result: "UNSCORED", scoring: false, alreadyScored: true } });
    setupExercise({ [`GET ${EXERCISE_ATTEMPT_PATH}`]: json(200, attempt) });
    const open = await screen.findByRole("listitem", { name: "Exercício 2" });
    expect(within(open).getByText("Já pontuado em outra atividade")).toBeTruthy();
    expect(within(open).queryByRole("radio")).toBeNull();
    expect(screen.getByRole("group", { name: "Correção do exercício 3" })).toBeTruthy();
  });

  it("013/US3-3 tentativa de refazer: prática, sem correção do professor", async () => {
    const practice = exerciseAttempt(
      { [MARK_OPEN_ID]: { result: "UNSCORED", scoring: false }, [MARK_CODE_ID]: { result: "UNSCORED", scoring: false, nature: null, comment: null, decidedAt: null }, [MARK_CHOICE_ID]: { scoring: false, points: 0 } },
      { number: 2 },
    );
    setupExercise({ [`GET ${EXERCISE_ATTEMPT_PATH}`]: json(200, practice) });
    expect(await screen.findByText("Tentativa 2: prática. Não vale pontos e não vai para a correção.")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Correção" })).toBeNull();
    expect(screen.getAllByText("Compare com o gabarito")).toHaveLength(2);
  });

  it("sem exercicios.corrigir a marcação aparece só para leitura", async () => {
    setupExercise({}, false);
    const code = await screen.findByRole("listitem", { name: "Exercício 3" });
    expect(screen.queryByRole("form", { name: "Correção" })).toBeNull();
    expect(within(code).getByText("Errado")).toBeTruthy();
    expect(within(code).getByText("Faltou o private.")).toBeTruthy();
  });

  it("013/US3 SC-012 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setupExercise();
    await screen.findByRole("form", { name: "Correção" });
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      screen.getByRole("link", { name: "Voltar para Lista de prática" }),
      radio(1, "Certo"),
      document.getElementById(commentFieldId(1))!,
      radio(2, "Errado"),
      document.getElementById(commentFieldId(2))!,
      screen.getByRole("button", { name: "Salvar correção" }),
      screen.getByRole("link", { name: "Próximo aluno: Carla Dias" }),
    ]);
  });
});
