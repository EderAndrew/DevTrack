import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ActivityDetail, EDIT_FIELD_IDS, VERSION_CONFLICT_NOTICE } from "./activity-detail";
import {
  ACTIVITY_ID,
  ATTEMPT_ID,
  activity,
  apiError,
  CLASS_ID,
  exerciseActivity,
  gradingActivity,
  json,
  MARK_CODE_ID,
  markingActivity,
  routedFetch,
} from "./test-fixtures";

const PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
const field = (id: string) => document.getElementById(id) as HTMLInputElement;

function setup(routes: Parameters<typeof routedFetch>[0] = {}, canApply = true, canRelease = false) {
  const api = routedFetch({
    [`GET ${PATH}`]: json(200, activity()),
    "GET /api/work-help/availability": json(200, { available: true, reason: null }),
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<ActivityDetail classId={CLASS_ID} activityId={ACTIVITY_ID} canApply={canApply} canRelease={canRelease} />);
  return { ...view, api, user: userEvent.setup() };
}

describe("012/US1 ActivityDetail — dados, edição, gabarito, alunos, encerrar e cancelar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("012/US1-8 mostra os dados, a regra de atraso, o gabarito e a situação de cada aluno em palavras", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Lista de herança" })).toBeTruthy();
    expect(screen.getByText("Publicada")).toBeTruthy();
    expect(screen.getByText("Não aceitar", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Entregas: 12 de 30")).toBeTruthy();
    const roster = screen.getByRole("table", { name: /Situação de cada aluno/ });
    expect(within(roster).getByText("Não iniciou")).toBeTruthy();
    const questions = screen.getByRole("region", { name: "Questões e gabarito" });
    expect(within(questions).getByText("(correta)").parentElement!.textContent).toBe("extends (correta)");
    expect(within(questions).getByText("Vale 1,00")).toBeTruthy();
  });

  it("012/US1-8 edita a regra de atraso e o prazo: só o que mudou, com a versão lida", async () => {
    const { api, user } = setup({ [`PATCH ${PATH}`]: json(200, activity({ latePolicy: "ACCEPT_MARKED", version: 3 })) });
    await screen.findByRole("form", { name: "Editar atividade" });
    await user.click(screen.getByRole("radio", { name: "Aceitar e marcar como atrasada" }));
    fireEvent.change(field(EDIT_FIELD_IDS.deadline), { target: { value: "2030-10-12T18:00" } });
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Alterações salvas.")).toBeTruthy();
    expect(api.writes()[0]!.body).toEqual({
      version: 2,
      deadline: new Date("2030-10-12T18:00").toISOString(),
      latePolicy: "ACCEPT_MARKED",
    });
  });

  it("012/US1-5 a data de publicação só muda enquanto agendada; prazo antes dela é recusado no campo", async () => {
    const { api, user } = setup();
    await screen.findByRole("form", { name: "Editar atividade" });
    expect(field(EDIT_FIELD_IDS.publishAt).readOnly).toBe(true);
    fireEvent.change(field(EDIT_FIELD_IDS.deadline), { target: { value: "2020-01-01T10:00" } });
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expectFieldErrorLinked(field(EDIT_FIELD_IDS.deadline));
    expect(api.writes()).toEqual([]);
  });

  it("012/FR-004 outra aba mudou a atividade: recarrega e avisa", async () => {
    const { api, user } = setup({
      [`PATCH ${PATH}`]: apiError(409, "ACTIVITY_VERSION_CONFLICT", "Esta atividade mudou em outra aba. Recarregue para ver a versão atual."),
    });
    await screen.findByRole("form", { name: "Editar atividade" });
    await user.clear(field(EDIT_FIELD_IDS.title));
    await user.type(field(EDIT_FIELD_IDS.title), "Outro título");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText(VERSION_CONFLICT_NOTICE)).toBeTruthy();
    expect(api.calls.filter((call) => call.method === "GET" && call.url === PATH)).toHaveLength(2);
  });

  it("012/US1-8 cancelar pede confirmação (ação de perigo) e só então envia; encerrar também confirma", async () => {
    const { api, user } = setup({
      [`POST ${PATH}/cancel`]: json(200, activity({ status: "CANCELLED", phase: null, version: 3 })),
      [`POST ${PATH}/close`]: json(200, activity({ status: "CLOSED", phase: null, version: 3 })),
    });
    const cancel = await screen.findByRole("button", { name: "Cancelar atividade" });
    expect(cancel.getAttribute("data-variant") ?? cancel.className).toMatch(/danger/);
    await user.click(cancel);
    const dialog = await screen.findByRole("alertdialog", { name: "Cancelar esta atividade?" });
    expect(api.writes()).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(api.writes()).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Encerrar atividade" }));
    const closeDialog = await screen.findByRole("alertdialog", { name: "Encerrar esta atividade?" });
    await user.click(within(closeDialog).getByRole("button", { name: "Encerrar atividade" }));
    expect(await screen.findByText("Atividade encerrada.")).toBeTruthy();
    expect(api.writes().map((call) => [call.method, call.url, call.body])).toEqual([["POST", `${PATH}/close`, {}]]);
    expect(screen.getByText("Encerrada")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Editar atividade" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Cancelar atividade" }));
    const again = await screen.findByRole("alertdialog", { name: "Cancelar esta atividade?" });
    await user.click(within(again).getByRole("button", { name: "Cancelar atividade" }));
    expect(await screen.findByText("Atividade cancelada.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancelar atividade" })).toBeNull();
  });

  it("sem atividades.aplicar não há edição nem ações", async () => {
    setup({}, false);
    await screen.findByRole("heading", { name: "Lista de herança" });
    expect(screen.queryByRole("form", { name: "Editar atividade" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar atividade" })).toBeNull();
  });

  it("012/US1-8 SC-012 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setup();
    await screen.findByRole("form", { name: "Editar atividade" });
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Encerrar atividade" }),
      screen.getByRole("button", { name: "Cancelar atividade" }),
      field(EDIT_FIELD_IDS.title),
      field(EDIT_FIELD_IDS.instructions),
      field(EDIT_FIELD_IDS.deadline),
      screen.getByRole("radio", { name: "Não aceitar" }),
      // 015: a work nobody started keeps its mode and AI help editable.
      screen.getByRole("checkbox", { name: "Modo controlado" }),
      screen.getByRole("checkbox", { name: "Ajuda da IA (3 perguntas por aluno)" }),
      screen.getByRole("button", { name: "Salvar alterações" }),
    ]);
  });
});

describe("012/US5 ActivityDetail — alunos e liberação do resultado", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("012/FR-006 cada aluno com tentativa leva à tentativa; nota parcial aparece como Correção pendente", async () => {
    setup({ [`GET ${PATH}`]: json(200, gradingActivity()) });
    const roster = await screen.findByRole("table", { name: /Situação de cada aluno/ });
    expect(within(roster).getByText("Ana Souza").closest("a")).toBeNull();
    expect(within(roster).getByRole("link", { name: "Bruno Lima" }).getAttribute("href")).toBe(
      `/turmas/${CLASS_ID}/atividades/${ACTIVITY_ID}/tentativas/${ATTEMPT_ID}`,
    );
    expect(within(roster).getByText("Correção pendente")).toBeTruthy();
    expect(within(roster).getByText("Não entregou")).toBeTruthy();
    expect(screen.getByText("Ainda não liberado")).toBeTruthy();
  });

  it("012/US5-4 liberar resultado confirma dizendo quantas entregas ainda estão pendentes e só então envia", async () => {
    const released = activity({ resultReleasedAt: "2026-10-11T12:00:00.000Z" });
    const { api, user } = setup({ [`POST ${PATH}/release`]: json(200, released) }, false, true);
    await user.click(await screen.findByRole("button", { name: "Liberar resultado" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Liberar o resultado desta atividade?" });
    expect(within(dialog).getByText(/3 entregas ainda têm correção pendente e aparecerão para os alunos assim que forem corrigidas\./)).toBeTruthy();
    expect(api.writes()).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Liberar resultado" }));
    expect(await screen.findByText("Resultado liberado.")).toBeTruthy();
    expect(api.writes().map((call) => [call.method, call.url, call.body])).toEqual([["POST", `${PATH}/release`, {}]]);
    expect(screen.getByText(/^Liberado em /)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Liberar resultado" })).toBeNull();
  });

  it("sem notas.liberar não há liberação", async () => {
    setup({}, true, false);
    await screen.findByRole("heading", { name: "Lista de herança" });
    expect(screen.queryByRole("button", { name: "Liberar resultado" })).toBeNull();
  });
});

describe("013/US1 ActivityDetail — Exercício com pontos, sem nota, prazo nem liberação", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("013/FR-003 mostra o nível e os pontos de cada exercício e o total; nada de prazo, regra, nota ou resultado", async () => {
    setup({ [`GET ${PATH}`]: json(200, exerciseActivity()) }, true, true);
    expect(await screen.findByRole("heading", { name: "Lista de prática" })).toBeTruthy();
    expect(screen.getByText("105 pontos", { selector: "dd" })).toBeTruthy();
    for (const term of ["Prazo", "Entrega atrasada", "Nota total", "Resultado"]) {
      expect(screen.queryByText(term, { selector: "dt" }), term).toBeNull();
    }
    expect(screen.queryByRole("button", { name: "Liberar resultado" })).toBeNull();

    const questions = screen.getByRole("region", { name: "Questões e gabarito" });
    expect(within(questions).getByText("Básico")).toBeTruthy();
    expect(within(questions).getByText("Vale 15 pontos")).toBeTruthy();
    expect(within(questions).getByText("Intermediário")).toBeTruthy();
    expect(within(questions).getByText("Vale 30 pontos")).toBeTruthy();
    expect(within(questions).getByText("Avançado")).toBeTruthy();
    expect(within(questions).getByText("Vale 60 pontos")).toBeTruthy();
  });

  it("013/US1-5 013/FR-004 a edição traz título, instruções e publicação; nunca prazo nem regra de atraso", async () => {
    const scheduled = exerciseActivity({ phase: "SCHEDULED", publishAt: "2030-10-01T12:00:00.000Z" });
    const { api, user } = setup({
      [`GET ${PATH}`]: json(200, scheduled),
      [`PATCH ${PATH}`]: json(200, exerciseActivity({ title: "Lista revisada", version: 3 })),
    });
    await screen.findByRole("form", { name: "Editar atividade" });
    expect(document.getElementById(EDIT_FIELD_IDS.deadline)).toBeNull();
    expect(screen.queryByRole("radio", { name: "Não aceitar" })).toBeNull();
    expect(field(EDIT_FIELD_IDS.publishAt).readOnly).toBe(false);

    await user.clear(field(EDIT_FIELD_IDS.title));
    await user.type(field(EDIT_FIELD_IDS.title), "Lista revisada");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Alterações salvas.")).toBeTruthy();
    expect(api.writes()[0]!.body).toEqual({ version: 2, title: "Lista revisada" });
  });

  it("013/FR-016 a turma do Exercício: quem concluiu, pontos e respostas aguardando correção, sem nota", async () => {
    setup({ [`GET ${PATH}`]: json(200, exerciseActivity()) });
    expect(await screen.findByText("Concluíram: 12 de 30")).toBeTruthy();
    const roster = screen.getByRole("table", { name: /Situação de cada aluno/ });
    expect(within(roster).queryByRole("columnheader", { name: "Nota" })).toBeNull();
    const bruno = within(roster).getByRole("link", { name: "Bruno Lima" }).closest("tr")!;
    expect(within(bruno).getByText("Concluiu")).toBeTruthy();
    expect(within(bruno).getByText("15 pontos")).toBeTruthy();
    expect(within(bruno).getByText("1")).toBeTruthy();
    const ana = within(roster).getByText("Ana Souza").closest("tr")!;
    expect(within(ana).getByText("0 pontos")).toBeTruthy();
  });

  it("013/FR-004 encerrar um Exercício avisa que os pontos ganhos continuam", async () => {
    const { user } = setup({ [`GET ${PATH}`]: json(200, exerciseActivity()) });
    await user.click(await screen.findByRole("button", { name: "Encerrar atividade" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Encerrar esta atividade?" });
    expect(within(dialog).getByText(/Os pontos já ganhos continuam valendo\./)).toBeTruthy();
  });

  it("013/FR-003 SC-012 Exercício sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setup({ [`GET ${PATH}`]: json(200, exerciseActivity()) });
    await screen.findByRole("form", { name: "Editar atividade" });
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Encerrar atividade" }),
      screen.getByRole("button", { name: "Cancelar atividade" }),
      field(EDIT_FIELD_IDS.title),
      field(EDIT_FIELD_IDS.instructions),
      screen.getByRole("button", { name: "Salvar alterações" }),
    ]);
  });
});

describe("014/US2 ActivityDetail — gabarito com o código colorido", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("014/US2-3 o código inicial e a solução esperada aparecem coloridos, só leitura", async () => {
    const base = markingActivity();
    const java = { id: "00000000-0000-4000-a000-000000000001", name: "Java", highlight: "java" };
    const withJava = { ...base, questions: base.questions.map((question) => (question.id === MARK_CODE_ID ? { ...question, language: java } : question)) };
    const { container } = setup({ [`GET ${PATH}`]: json(200, withJava) }, true, true);
    const questions = await screen.findByRole("region", { name: "Questões e gabarito" });
    const starter = within(questions).getByRole("group", { name: "Código inicial" });
    const solution = within(questions).getByRole("group", { name: "Solução esperada" });
    await waitFor(() => {
      expect(starter.querySelector(".text-syntax-keyword")).toBeTruthy();
      expect(solution.querySelector(".text-syntax-keyword")).toBeTruthy();
    });
    expect(starter.querySelector("pre code")!.textContent).toBe("class Conta {}");
    expect(solution.querySelector("pre code")!.textContent).toBe("class Conta { private saldo; }");
    expect(questions.querySelector("textarea, [contenteditable]")).toBeNull();
    await expectNoA11yViolations(container);
  });
});

describe("015/US1 ActivityDetail — modo controlado e ajuda da IA do Trabalho", () => {
  afterEach(() => vi.unstubAllGlobals());

  const helpBox = () => screen.getByRole("checkbox", { name: "Ajuda da IA (3 perguntas por aluno)" }) as HTMLInputElement;
  const controlledBox = () => screen.getByRole("checkbox", { name: "Modo controlado" }) as HTMLInputElement;
  const started = () =>
    activity({
      executionMode: "CONTROLLED",
      aiHelp: { allowance: 3 },
      roster: [{ ...activity().roster[0]!, status: "IN_PROGRESS", attemptId: ATTEMPT_ID }],
    });

  it("015/FR-006 015/US1-1 mostra \"Modo controlado\" e \"Ajuda da IA\" por texto; nada para um trabalho normal", async () => {
    setup({ [`GET ${PATH}`]: json(200, activity({ executionMode: "CONTROLLED", aiHelp: { allowance: 3 } })) }, false);
    await screen.findByRole("heading", { name: "Lista de herança" });
    const options = screen.getByRole("list", { name: "Como os alunos respondem" });
    expect(within(options).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Modo controlado", "Ajuda da IA: 3 por aluno"]);
  });

  it("015/FR-006 um trabalho normal sem ajuda não mostra as marcas", async () => {
    setup({}, false);
    await screen.findByRole("heading", { name: "Lista de herança" });
    expect(screen.queryByRole("list", { name: "Como os alunos respondem" })).toBeNull();
  });

  it("015/US1-4 liga as opções antes do primeiro início: só o que mudou, com a versão lida", async () => {
    const { api, user } = setup({ [`PATCH ${PATH}`]: json(200, activity({ executionMode: "CONTROLLED", aiHelp: { allowance: 3 }, version: 3 })) });
    await screen.findByRole("form", { name: "Editar atividade" });
    await waitFor(() => expect(helpBox().disabled).toBe(false));
    await user.click(controlledBox());
    await user.click(helpBox());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Alterações salvas.")).toBeTruthy();
    expect(api.writes()[0]!.body).toEqual({ version: 2, executionMode: "CONTROLLED", aiHelpAllowance: 3 });
  });

  it("015/US1-4 depois que um aluno iniciou: opções travadas, com o motivo, e fora do pedido", async () => {
    const { api, user } = setup({ [`GET ${PATH}`]: json(200, started()), [`PATCH ${PATH}`]: json(200, started()) });
    await screen.findByRole("form", { name: "Editar atividade" });
    const reason = screen.getByText("Não é possível mudar depois que um aluno iniciou.");
    for (const box of [controlledBox(), helpBox()]) {
      expect(box.disabled).toBe(true);
      expect(box.checked).toBe(true);
      expect(box.getAttribute("aria-describedby")!.split(" ")).toContain(reason.id);
    }
    await user.clear(field(EDIT_FIELD_IDS.title));
    await user.type(field(EDIT_FIELD_IDS.title), "Outro título");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Alterações salvas.");
    expect(api.writes()[0]!.body).toEqual({ version: 2, title: "Outro título" });
  });

  it("015/US1-4 a recusa do servidor (409 ACTIVITY_ALREADY_STARTED) aparece no resumo", async () => {
    const { user } = setup({
      [`PATCH ${PATH}`]: apiError(409, "ACTIVITY_ALREADY_STARTED", "Não é possível mudar depois que um aluno iniciou."),
    });
    await screen.findByRole("form", { name: "Editar atividade" });
    await user.click(controlledBox());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    const summary = (await screen.findByText("Não foi possível salvar")).closest("[role=group]") as HTMLElement;
    expect(within(summary).getByText("Não é possível mudar depois que um aluno iniciou.")).toBeTruthy();
  });

  it("015/US1-3 ajuda indisponível: quem já tem a ajuda pode desligá-la; quem não tem não pode ligar", async () => {
    const unavailable = json(200, { available: false, reason: "AGENT_DISABLED" });
    const { api, user } = setup({
      "GET /api/work-help/availability": unavailable,
      [`GET ${PATH}`]: json(200, activity({ aiHelp: { allowance: 3 } })),
      [`PATCH ${PATH}`]: json(200, activity({ version: 3 })),
    });
    await screen.findByRole("form", { name: "Editar atividade" });
    await screen.findByText("A ajuda da IA está indisponível: o administrador ainda não ativou a ajuda da IA.");
    expect(helpBox().disabled).toBe(false);
    await user.click(helpBox());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Alterações salvas.");
    expect(api.writes()[0]!.body).toEqual({ version: 2, aiHelpAllowance: 0 });
    // Saved without the help: it can't be turned on again while unavailable.
    await waitFor(() => expect(helpBox().disabled).toBe(true));
  });

  it("015/FR-002 o Exercício não tem as opções na edição", async () => {
    setup({ [`GET ${PATH}`]: json(200, exerciseActivity()) });
    await screen.findByRole("form", { name: "Editar atividade" });
    expect(screen.queryByRole("group", { name: "Como os alunos respondem" })).toBeNull();
  });

  it("015/US1-4 SC-012 opções travadas sem violações de acessibilidade", async () => {
    const { container } = setup({ [`GET ${PATH}`]: json(200, started()) });
    await screen.findByRole("form", { name: "Editar atividade" });
    await expectNoA11yViolations(container);
  });
});
