import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { feedbackFieldId, GENERAL_FEEDBACK_FIELD_ID, gradeFieldId } from "../schemas/attempt-grading";
import { AttemptReview, GRADING_CONFLICT_NOTICE } from "./attempt-review";
import {
  ACTIVITY_ID,
  ATTEMPT_ID,
  apiError,
  CLASS_ID,
  gradingActivity,
  json,
  OPEN_QUESTION_ID,
  routedFetch,
  teacherAttempt,
} from "./test-fixtures";

const ACTIVITY_PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
const ATTEMPT_PATH = `${ACTIVITY_PATH}/attempts/${ATTEMPT_ID}`;
const field = (id: string) => document.getElementById(id) as HTMLInputElement;

function setup(routes: Parameters<typeof routedFetch>[0] = {}, canGrade = true) {
  const api = routedFetch({
    [`GET ${ACTIVITY_PATH}`]: json(200, gradingActivity()),
    [`GET ${ATTEMPT_PATH}`]: json(200, teacherAttempt()),
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} canGrade={canGrade} />);
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
    renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={missedId} canGrade />);
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
