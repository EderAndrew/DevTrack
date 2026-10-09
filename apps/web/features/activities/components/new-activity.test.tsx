import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { NEW_ACTIVITY_FIELD_IDS, NewActivity } from "./new-activity";
import {
  activity,
  apiError,
  CLASS_ID,
  EXERCISES,
  json,
  OUT_OF_SCOPE,
  routedFetch,
  schoolClass,
  WORK,
} from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NO_SCOPE = { hasPlan: true, outOfScope: [] };
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const setValue = (id: string, value: string) => fireEvent.change(field(id), { target: { value } });

const AVAILABLE = { available: true, reason: null };

function setup(
  scope: object = NO_SCOPE,
  create: Response | ((body: unknown) => Response) = json(201, activity()),
  availability: Response = json(200, AVAILABLE),
) {
  const api = routedFetch({
    [`GET /api/classes/${CLASS_ID}`]: json(200, schoolClass()),
    "GET /api/work-help/availability": availability,
    "GET /api/works?*": json(200, { items: [WORK], nextCursor: null }),
    "GET /api/exercises?*": json(200, { items: EXERCISES, nextCursor: null }),
    [`POST /api/classes/${CLASS_ID}/activities/scope-check`]: json(200, scope),
    [`POST /api/classes/${CLASS_ID}/activities`]: create,
  });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<NewActivity classId={CLASS_ID} />);
  return { ...view, api, user: userEvent.setup() };
}

/** Step 1 with three exercises in the order 2, 1, 3, then "Continuar". */
async function chooseExercises(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("radio", { name: "Exercício" }));
  await user.click(await screen.findByRole("checkbox", { name: /O que é polimorfismo/ }));
  await user.click(screen.getByRole("checkbox", { name: /O que é herança/ }));
  await user.click(screen.getByRole("checkbox", { name: /O que é uma interface/ }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByRole("form", { name: "Dados da atividade" });
}

describe("012/US1 NewActivity — aplicar trabalho ou exercícios à turma", () => {
  beforeEach(() => router.push.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("012/US1-1 aplica um trabalho aprovado da disciplina: título preenchido, publicação imediata e prazo", async () => {
    const { api, user } = setup();
    await user.click(await screen.findByRole("radio", { name: /Trabalho de herança/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(api.writes()[0]).toMatchObject({ body: { type: "ASSIGNMENT", workId: WORK.id } });

    expect(await screen.findByDisplayValue("Trabalho de herança")).toBeTruthy();
    expect(screen.queryByLabelText(/Nota total/)).toBeNull();
    setValue(NEW_ACTIVITY_FIELD_IDS.deadline, "2030-10-10T23:59");
    await user.click(screen.getByRole("radio", { name: "Aceitar e marcar como atrasada" }));
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));

    const sent = api.writes()[1]!.body as Record<string, unknown>;
    expect(sent).toMatchObject({
      source: { type: "ASSIGNMENT", workId: WORK.id },
      title: "Trabalho de herança",
      publishAt: null,
      deadline: new Date("2030-10-10T23:59").toISOString(),
      latePolicy: "ACCEPT_MARKED",
      acknowledgeOutOfScope: false,
    });
    expect(sent).not.toHaveProperty("totalGrade");
    expect(router.push).toHaveBeenCalledWith(`/turmas/${CLASS_ID}/atividades/${activity().id}`);
  });

  // 012/US1-7 (a total grade split among the exercises) was replaced by 013/US1-1 (spec 013): an
  // Exercício goes out without grade, deadline or late policy; the points preview is 013's (US1).
  it("012/US1-7 013/FR-001 exercícios na ordem escolhida, sem nota, prazo nem regra de atraso no formulário e no pedido", async () => {
    const { api, user } = setup();
    await chooseExercises(user);
    expect(api.writes()[0]!.body).toEqual({ type: "EXERCISE", exerciseIds: [EXERCISES[1]!.id, EXERCISES[0]!.id, EXERCISES[2]!.id] });

    expect(screen.queryByLabelText(/Nota total/)).toBeNull();
    expect(screen.queryByLabelText(/Prazo de entrega/)).toBeNull();
    expect(screen.queryByRole("radio", { name: "Não aceitar" })).toBeNull();
    // An Exercício has no work title to prefill.
    expect(field(NEW_ACTIVITY_FIELD_IDS.title).value).toBe("");
    await user.type(field(NEW_ACTIVITY_FIELD_IDS.title), "Lista de revisão");
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    const sent = api.writes()[1]!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ title: "Lista de revisão", publishAt: null, source: { type: "EXERCISE" } });
    for (const key of ["totalGrade", "deadline", "latePolicy"]) expect(sent).not.toHaveProperty(key);
  });

  it("012/US1-7 a ordem dos exercícios muda com os botões de mover", async () => {
    const { api, user } = setup();
    await user.click(await screen.findByRole("radio", { name: "Exercício" }));
    await user.click(await screen.findByRole("checkbox", { name: /O que é herança/ }));
    await user.click(screen.getByRole("checkbox", { name: /O que é polimorfismo/ }));
    await user.click(screen.getByRole("button", { name: "Mover a questão 2 para cima" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(api.writes()[0]!.body).toEqual({ type: "EXERCISE", exerciseIds: [EXERCISES[1]!.id, EXERCISES[0]!.id] });
  });

  it("012/US1-5 erros por campo ligados: publicação agendada sem data, prazo vazio e prazo antes da publicação", async () => {
    const { api, user, container } = setup();
    await user.click(await screen.findByRole("radio", { name: /Trabalho de herança/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByRole("form", { name: "Dados da atividade" });
    await user.click(screen.getByRole("radio", { name: "Agendar" }));
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    expectFieldErrorLinked(field(NEW_ACTIVITY_FIELD_IDS.publishAt));
    expectFieldErrorLinked(field(NEW_ACTIVITY_FIELD_IDS.deadline));

    setValue(NEW_ACTIVITY_FIELD_IDS.publishAt, "2030-10-11T08:00");
    setValue(NEW_ACTIVITY_FIELD_IDS.deadline, "2030-10-10T23:59");
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    expectFieldErrorLinked(field(NEW_ACTIVITY_FIELD_IDS.deadline));
    expect(screen.getAllByText("O prazo deve ser depois da data de publicação.").length).toBeGreaterThan(0);
    expect(api.writes()).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it("012/US1-5 a recusa do servidor (INVALID_SCHEDULE) aparece no campo do prazo", async () => {
    const { user } = setup(NO_SCOPE, apiError(422, "INVALID_SCHEDULE", "O prazo deve ser depois da data de publicação."));
    await user.click(await screen.findByRole("radio", { name: /Trabalho de herança/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    setValue(NEW_ACTIVITY_FIELD_IDS.deadline, "2030-10-10T23:59");
    await user.click(await screen.findByRole("button", { name: "Publicar atividade" }));
    await screen.findByText("Não foi possível publicar a atividade");
    expectFieldErrorLinked(field(NEW_ACTIVITY_FIELD_IDS.deadline));
  });

  it("012/FR-005a tópicos ainda não concluídos: a confirmação é obrigatória e vai no pedido", async () => {
    const { api, user } = setup(OUT_OF_SCOPE);
    await user.click(await screen.findByRole("radio", { name: /Trabalho de herança/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Tópicos ainda não concluídos no planejamento desta turma")).toBeTruthy();
    expect(screen.getByText("Polimorfismo (questões 2, 3)")).toBeTruthy();

    setValue(NEW_ACTIVITY_FIELD_IDS.deadline, "2030-10-10T23:59");
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    const confirmation = screen.getByRole("checkbox", { name: "Entendo e quero aplicar mesmo assim" });
    expectFieldErrorLinked(confirmation);
    expect(api.writes()).toHaveLength(1);

    await user.click(confirmation);
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    expect(api.writes()[1]!.body).toMatchObject({ acknowledgeOutOfScope: true });
  });

  it("012/FR-005 uma chave por formulário: tentar de novo depois de uma falha reenvia a mesma chave", async () => {
    let attempt = 0;
    const { api, user } = setup(NO_SCOPE, () => (++attempt === 1 ? apiError(500, "INTERNAL_ERROR", "Erro interno.") : json(201, activity())));
    await user.click(await screen.findByRole("radio", { name: /Trabalho de herança/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    setValue(NEW_ACTIVITY_FIELD_IDS.deadline, "2030-10-10T23:59");
    await user.click(await screen.findByRole("button", { name: "Publicar atividade" }));
    await screen.findByText("Não foi possível publicar a atividade");
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    const [first, second] = api.writes().slice(1).map((call) => (call.body as { idempotencyKey: string }).idempotencyKey);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("012/US1-3 sem item escolhido não continua; turma sem disciplina só aceita exercícios", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert").textContent).toBe("Escolha um trabalho.");
    vi.unstubAllGlobals();
    document.body.innerHTML = "";

    const api = routedFetch({
      [`GET /api/classes/${CLASS_ID}`]: json(200, schoolClass({ subject: null })),
      "GET /api/exercises?*": json(200, { items: EXERCISES, nextCursor: null }),
    });
    vi.stubGlobal("fetch", api.fetch);
    renderWithProviders(<NewActivity classId={CLASS_ID} />);
    expect(await screen.findByText("Esta turma não tem disciplina: só exercícios podem ser aplicados.")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Trabalho" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("radio", { name: "Exercício" }) as HTMLInputElement).checked).toBe(true);
  });

  it("012/US1-8 SC-012 passo 2 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setup(OUT_OF_SCOPE);
    await chooseExercises(user);
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      field(NEW_ACTIVITY_FIELD_IDS.title),
      field(NEW_ACTIVITY_FIELD_IDS.instructions),
      screen.getByRole("radio", { name: "Publicar agora" }),
      screen.getByRole("checkbox", { name: "Entendo e quero aplicar mesmo assim" }),
      screen.getByRole("button", { name: "Publicar atividade" }),
      screen.getByRole("button", { name: "Voltar" }),
    ]);
  });
});

/** Step 1 with the work, then "Continuar", up to the details form. */
async function chooseWork(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("radio", { name: /Trabalho de herança/ }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByRole("form", { name: "Dados da atividade" });
}

describe("015/US1 NewActivity — modo controlado e ajuda da IA no Trabalho", () => {
  beforeEach(() => router.push.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("015/US1-1 o Trabalho mostra \"Como os alunos respondem\" com as explicações; as duas ligadas vão no pedido", async () => {
    const { api, user } = setup();
    await chooseWork(user);
    const options = screen.getByRole("group", { name: "Como os alunos respondem" });
    const controlled = within(options).getByRole("checkbox", { name: "Modo controlado" });
    const help = within(options).getByRole("checkbox", { name: "Ajuda da IA (3 perguntas por aluno)" });
    expect(controlled.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(controlled.getAttribute("aria-describedby")!)!.textContent).toBe(
      "O aluno responde em tela cheia; saídas da tela e tentativas de copiar ou colar ficam registradas. Copiar e colar ficam bloqueados.",
    );
    await waitFor(() => expect((help as HTMLInputElement).disabled).toBe(false));
    expect(document.getElementById(help.getAttribute("aria-describedby")!)!.textContent).toBe(
      "A IA orienta sem dar a resposta. Você verá as perguntas e as orientações na correção.",
    );
    setValue(NEW_ACTIVITY_FIELD_IDS.deadline, "2030-10-10T23:59");
    await user.click(controlled);
    await user.click(help);
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    expect(api.writes()[1]!.body).toMatchObject({ executionMode: "CONTROLLED", aiHelpAllowance: 3 });
  });

  it("015/US1-2 sem mexer nas opções: NORMAL e nenhuma ajuda", async () => {
    const { api, user } = setup();
    await chooseWork(user);
    setValue(NEW_ACTIVITY_FIELD_IDS.deadline, "2030-10-10T23:59");
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    expect(api.writes()[1]!.body).toMatchObject({ executionMode: "NORMAL", aiHelpAllowance: 0 });
  });

  it("015/US1-3 015/FR-004 ajuda indisponível: desabilitada com o motivo; o modo controlado continua", async () => {
    const { user } = setup(NO_SCOPE, json(201, activity()), json(200, { available: false, reason: "AGENT_DISABLED" }));
    await chooseWork(user);
    const help = screen.getByRole("checkbox", { name: "Ajuda da IA (3 perguntas por aluno)" }) as HTMLInputElement;
    const reason = await screen.findByText("A ajuda da IA está indisponível: o administrador ainda não ativou a ajuda da IA.");
    expect(help.disabled).toBe(true);
    expect(help.getAttribute("aria-describedby")!.split(" ")).toContain(reason.id);
    expect((screen.getByRole("checkbox", { name: "Modo controlado" }) as HTMLInputElement).disabled).toBe(false);
  });

  it("015/US1-3 sem modelo de IA, a ajuda também fica indisponível", async () => {
    const { user } = setup(NO_SCOPE, json(201, activity()), json(200, { available: false, reason: "MODEL_UNAVAILABLE" }));
    await chooseWork(user);
    expect(await screen.findByText("A ajuda da IA está indisponível: nenhum modelo de IA está disponível agora.")).toBeTruthy();
  });

  it("015/US1-3 se a verificação falhar, a ajuda fica desabilitada e diz por quê", async () => {
    const { user } = setup(NO_SCOPE, json(201, activity()), apiError(500, "INTERNAL_ERROR", "Erro interno."));
    await chooseWork(user);
    expect(await screen.findByText("A ajuda da IA está indisponível: não foi possível verificar agora.")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Ajuda da IA (3 perguntas por aluno)" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("015/US1-3 a recusa do servidor (503 AI_HELP_UNAVAILABLE) aparece no resumo de erros", async () => {
    const { user } = setup(
      NO_SCOPE,
      apiError(503, "AI_HELP_UNAVAILABLE", "A ajuda está indisponível agora; tente de novo em instantes."),
    );
    await chooseWork(user);
    setValue(NEW_ACTIVITY_FIELD_IDS.deadline, "2030-10-10T23:59");
    const help = screen.getByRole("checkbox", { name: "Ajuda da IA (3 perguntas por aluno)" }) as HTMLInputElement;
    await waitFor(() => expect(help.disabled).toBe(false));
    await user.click(help);
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    const summary = (await screen.findByText("Não foi possível publicar a atividade")).closest("[role=group]") as HTMLElement;
    expect(within(summary).getByText("A ajuda está indisponível agora; tente de novo em instantes.")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("015/FR-002 o Exercício não tem as opções, nem no pedido", async () => {
    const { api, user } = setup();
    await chooseExercises(user);
    expect(screen.queryByRole("group", { name: "Como os alunos respondem" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Modo controlado" })).toBeNull();
    await user.type(field(NEW_ACTIVITY_FIELD_IDS.title), "Prática");
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    const sent = api.writes()[1]!.body as object;
    expect(sent).not.toHaveProperty("executionMode");
    expect(sent).not.toHaveProperty("aiHelpAllowance");
  });

  it("015/US1-1 SC-012 passo 2 do Trabalho com as opções sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setup();
    await chooseWork(user);
    const help = screen.getByRole("checkbox", { name: "Ajuda da IA (3 perguntas por aluno)" }) as HTMLInputElement;
    await waitFor(() => expect(help.disabled).toBe(false));
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      field(NEW_ACTIVITY_FIELD_IDS.title),
      field(NEW_ACTIVITY_FIELD_IDS.instructions),
      screen.getByRole("radio", { name: "Publicar agora" }),
      field(NEW_ACTIVITY_FIELD_IDS.deadline),
      screen.getByRole("radio", { name: "Não aceitar" }),
      screen.getByRole("checkbox", { name: "Modo controlado" }),
      help,
      screen.getByRole("button", { name: "Publicar atividade" }),
      screen.getByRole("button", { name: "Voltar" }),
    ]);
    // Space toggles a box from the keyboard.
    screen.getByRole("checkbox", { name: "Modo controlado" }).focus();
    await user.keyboard(" ");
    expect((screen.getByRole("checkbox", { name: "Modo controlado" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("013/US1 NewActivity — exercícios valem pontos pelo nível", () => {
  beforeEach(() => router.push.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("013/US1-1 013/FR-003 cada exercício escolhido mostra o nível e \"Vale N pontos\"; o total soma 105", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("radio", { name: "Exercício" }));
    expect(await screen.findByRole("checkbox", { name: /Intermediário: O que é polimorfismo/ })).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /O que é herança/ }));
    const order = screen.getByRole("heading", { name: "Ordem das questões" }).parentElement!;
    expect(within(order).getByText("Básico · Vale 15 pontos")).toBeTruthy();
    expect(within(order).getByText("Total: 15 pontos")).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: /O que é polimorfismo/ }));
    await user.click(screen.getByRole("checkbox", { name: /O que é uma interface/ }));
    expect(within(order).getByText("Intermediário · Vale 30 pontos")).toBeTruthy();
    expect(within(order).getByText("Avançado · Vale 60 pontos")).toBeTruthy();
    expect(within(order).getByText("Total: 105 pontos")).toBeTruthy();

    // Unchecking one takes its points out of the total.
    await user.click(screen.getByRole("checkbox", { name: /O que é uma interface/ }));
    expect(within(order).getByText("Total: 45 pontos")).toBeTruthy();
  });

  it("013/FR-001 013/FR-003 o passo 2 do Exercício mostra o total e nenhum campo de nota, prazo ou atraso", async () => {
    const { api, user } = setup();
    await chooseExercises(user);
    expect(screen.getByText(/^Total: 105 pontos\./)).toBeTruthy();
    expect(screen.queryByLabelText(/Nota total/)).toBeNull();
    expect(screen.queryByLabelText(/Prazo de entrega/)).toBeNull();
    expect(screen.queryByRole("group", { name: /Entrega atrasada/ })).toBeNull();
    await user.type(field(NEW_ACTIVITY_FIELD_IDS.title), "Prática");
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    expect(Object.keys(api.writes()[1]!.body as object).sort()).toEqual([
      "acknowledgeOutOfScope",
      "idempotencyKey",
      "instructions",
      "publishAt",
      "source",
      "title",
    ]);
  });

  it("013/FR-003 SC-012 escolha de exercícios com pontos sem violações de acessibilidade", async () => {
    const { user, container } = setup();
    await user.click(await screen.findByRole("radio", { name: "Exercício" }));
    await user.click(await screen.findByRole("checkbox", { name: /O que é herança/ }));
    await user.click(screen.getByRole("checkbox", { name: /O que é polimorfismo/ }));
    await screen.findByText("Total: 45 pontos");
    await expectNoA11yViolations(container);
  });
});
