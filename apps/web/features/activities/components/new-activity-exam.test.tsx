import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ActivityDetail } from "./activity-detail";
import { NEW_ACTIVITY_FIELD_IDS, NewActivity } from "./new-activity";
import { ACTIVITY_ID, apiError, CLASS_ID, EXAM, EXAM_SCOPE, examActivity, json, routedFetch, schoolClass, WORK } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const setValue = (id: string, value: string) => fireEvent.change(field(id), { target: { value } });

function setup(scope: object = EXAM_SCOPE, create: Response = json(201, examActivity()), classView = schoolClass()) {
  const api = routedFetch({
    [`GET /api/classes/${CLASS_ID}`]: json(200, classView),
    "GET /api/works?*": json(200, { items: [WORK], nextCursor: null }),
    "GET /api/exams?*": json(200, { items: [EXAM], nextCursor: null }),
    "GET /api/exercises?*": json(200, { items: [], nextCursor: null }),
    [`POST /api/classes/${CLASS_ID}/activities/scope-check`]: json(200, scope),
    [`POST /api/classes/${CLASS_ID}/activities`]: create,
  });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<NewActivity classId={CLASS_ID} />);
  return { ...view, api, user: userEvent.setup() };
}

/** Step 1: "Prova", the approved exam, then "Continuar". */
async function chooseExam(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("radio", { name: "Prova" }));
  await user.click(await screen.findByRole("radio", { name: /Prova de herança/ }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByRole("form", { name: "Dados da atividade" });
}

/** Tab into the radio's group, then the arrow keys until it is checked (native radios of one `name` are one Tab stop). */
async function chooseByKeyboard(user: ReturnType<typeof userEvent.setup>, radio: HTMLElement) {
  const name = radio.getAttribute("name");
  const group = name ? [...document.querySelectorAll<HTMLElement>(`input[type="radio"][name="${name}"]`)] : [radio];
  for (let i = 0; i < 100 && !group.includes(document.activeElement as HTMLElement); i += 1) await user.tab();
  for (let i = 0; i < group.length && document.activeElement !== radio; i += 1) {
    await user.keyboard("{ArrowDown}");
  }
  expect(document.activeElement).toBe(radio);
  if (!(radio as HTMLInputElement).checked) await user.keyboard(" ");
  expect((radio as HTMLInputElement).checked).toBe(true);
}

describe("018/US2 NewActivity — aplicar uma prova do banco à turma", () => {
  beforeEach(() => router.push.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("018/US2-1 \"Prova do banco\": as aprovadas da disciplina, e a cobertura por tópico e por dificuldade antes de confirmar", async () => {
    const { api, user, container } = setup();
    await user.click(await screen.findByRole("radio", { name: "Prova" }));
    expect(await screen.findByRole("group", { name: /Prova do banco/ })).toBeTruthy();
    const listed = api.calls.find((call) => call.url.startsWith("/api/exams?"))!;
    expect(new URL(listed.url, "http://localhost").searchParams.get("status")).toBe("APPROVED");
    expect(new URL(listed.url, "http://localhost").searchParams.get("subjectId")).toBe(schoolClass().subject!.id);
    await user.click(screen.getByRole("radio", { name: /Prova de herança — 3 questões, nota 10,00/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(api.writes()[0]!.body).toEqual({ type: "EXAM", examId: EXAM.id });

    const byTopic = await screen.findByRole("table", { name: "Cobertura por tópico" });
    const topicRows = within(byTopic).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(topicRows).toEqual(["Herança13,34", "PolimorfismoFora do escopo ensinado26,66"]);
    const byDifficulty = screen.getByRole("table", { name: "Cobertura por dificuldade" });
    expect(within(byDifficulty).getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      "Básico13,34",
      "Intermediário26,66",
      "Avançado00,00",
    ]);
    // The 012 acknowledgement for the topic out of the taught scope.
    expect(screen.getByRole("checkbox", { name: "Entendo e quero aplicar mesmo assim" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("018/US2-2 018/FR-007 duração, inatividade (padrão 60 s) e limite para iniciar (padrão 15 min) vão no pedido; sem prazo", async () => {
    const { api, user } = setup({ ...EXAM_SCOPE, outOfScope: [], coverage: { ...EXAM_SCOPE.coverage!, byTopic: [EXAM_SCOPE.coverage!.byTopic[0]!] } });
    await chooseExam(user);
    expect(field(NEW_ACTIVITY_FIELD_IDS.title).value).toBe("Prova de herança");
    expect(field(NEW_ACTIVITY_FIELD_IDS.inactivityLimitSeconds).value).toBe("60");
    expect(field(NEW_ACTIVITY_FIELD_IDS.startWindowMinutes).value).toBe("15");
    setValue(NEW_ACTIVITY_FIELD_IDS.durationMinutes, "30");
    setValue(NEW_ACTIVITY_FIELD_IDS.inactivityLimitSeconds, "45");
    await user.click(screen.getByRole("button", { name: "Aplicar prova" }));

    const sent = api.writes()[1]!.body as Record<string, unknown>;
    expect(sent).toEqual({
      idempotencyKey: expect.any(String),
      source: { type: "EXAM", examId: EXAM.id },
      title: "Prova de herança",
      instructions: null,
      publishAt: null,
      durationMinutes: 30,
      inactivityLimitSeconds: 45,
      startWindowMinutes: 15,
      acknowledgeOutOfScope: false,
    });
    expect(router.push).toHaveBeenCalledWith(`/turmas/${CLASS_ID}/atividades/${ACTIVITY_ID}`);
  });

  it("018/SC-011 o professor escolhe e aplica a prova só com o teclado", async () => {
    const { api, user } = setup({ ...EXAM_SCOPE, outOfScope: [], coverage: { ...EXAM_SCOPE.coverage!, byTopic: [EXAM_SCOPE.coverage!.byTopic[0]!] } });
    await chooseByKeyboard(user, await screen.findByRole("radio", { name: "Prova" }));
    await chooseByKeyboard(user, await screen.findByRole("radio", { name: /Prova de herança/ }));
    await tabTo(user, screen.getByRole("button", { name: "Continuar" }));
    await user.keyboard("{Enter}");
    await screen.findByRole("form", { name: "Dados da atividade" });
    await tabTo(user, field(NEW_ACTIVITY_FIELD_IDS.durationMinutes));
    await user.keyboard("{Backspace}{Backspace}{Backspace}30");
    await tabTo(user, screen.getByRole("button", { name: "Aplicar prova" }));
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith(`/turmas/${CLASS_ID}/atividades/${ACTIVITY_ID}`));
    expect(api.writes()[1]!.body).toMatchObject({ source: { type: "EXAM", examId: EXAM.id }, durationMinutes: 30 });
  });

  it("018/US2-2 faixas recusadas no formulário, com o erro ligado ao campo, e nada é enviado", async () => {
    const { api, user } = setup();
    await chooseExam(user);
    await user.click(screen.getByRole("checkbox", { name: "Entendo e quero aplicar mesmo assim" }));
    for (const [id, value, message] of [
      [NEW_ACTIVITY_FIELD_IDS.durationMinutes, "121", "A duração vai de 1 a 120 minutos."],
      [NEW_ACTIVITY_FIELD_IDS.inactivityLimitSeconds, "29", "O limite de inatividade vai de 30 a 60 segundos."],
      [NEW_ACTIVITY_FIELD_IDS.startWindowMinutes, "61", "O limite para iniciar vai de 0 a 60 minutos."],
    ] as const) {
      setValue(NEW_ACTIVITY_FIELD_IDS.durationMinutes, "30");
      setValue(NEW_ACTIVITY_FIELD_IDS.inactivityLimitSeconds, "60");
      setValue(NEW_ACTIVITY_FIELD_IDS.startWindowMinutes, "15");
      setValue(id, value);
      await user.click(screen.getByRole("button", { name: "Aplicar prova" }));
      expectFieldErrorLinked(field(id));
      expect(screen.getAllByText(message).length).toBeGreaterThan(0);
    }
    expect(api.writes()).toHaveLength(1);
  });

  it("018/US2-5 018/FR-010 sem opções de modo, ajuda da IA, liberação, prazo ou entrega atrasada", async () => {
    const { user } = setup();
    await chooseExam(user);
    expect(screen.queryByRole("checkbox", { name: /Modo controlado/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Ajuda da IA/ })).toBeNull();
    expect(screen.queryByLabelText(/Prazo de entrega/)).toBeNull();
    expect(screen.queryByRole("radio", { name: "Não aceitar" })).toBeNull();
    expect(screen.queryByText(/Como os alunos respondem/)).toBeNull();
    expect(screen.getByText(/sempre em modo restrito, sem ajuda da IA e só para os alunos marcados presentes/)).toBeTruthy();
  });

  it("018/FR-007 uma turma sem disciplina não aplica prova", async () => {
    setup(EXAM_SCOPE, json(201, examActivity()), schoolClass({ subject: null }));
    expect((await screen.findByRole("radio", { name: "Prova" })).hasAttribute("disabled")).toBe(true);
  });

  it("018/FR-007 EXAM_NOT_APPROVED na verificação aparece em texto", async () => {
    const api = routedFetch({
      [`GET /api/classes/${CLASS_ID}`]: json(200, schoolClass()),
      "GET /api/works?*": json(200, { items: [], nextCursor: null }),
      "GET /api/exams?*": json(200, { items: [EXAM], nextCursor: null }),
      [`POST /api/classes/${CLASS_ID}/activities/scope-check`]: apiError(409, "EXAM_NOT_APPROVED", "x"),
    });
    vi.stubGlobal("fetch", api.fetch);
    renderWithProviders(<NewActivity classId={CLASS_ID} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "Prova" }));
    await user.click(await screen.findByRole("radio", { name: /Prova de herança/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Só uma prova aprovada pode ser aplicada.");
  });
});

describe("018/US2 ActivityDetail — a prova aplicada abre em \"Chamada e prova\"", () => {
  afterEach(() => vi.unstubAllGlobals());

  const PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
  const room = {
    releaseMode: "PRESENT_ONLY",
    present: 0,
    enrolled: 1,
    students: [{ studentUserId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", name: "Ana Souza", markedAt: null, roomStatus: "NOT_MARKED", attemptId: null, openPause: null }],
  };

  function setupDetail(initialTab?: "informacoes") {
    const api = routedFetch({ [`GET ${PATH}`]: json(200, examActivity()), [`GET ${PATH}/attendance`]: json(200, room) });
    vi.stubGlobal("fetch", api.fetch);
    const view = renderWithProviders(
      <ActivityDetail classId={CLASS_ID} activityId={ACTIVITY_ID} canApply canRelease canTakeAttendance initialTab={initialTab} />,
    );
    return { ...view, api, user: userEvent.setup() };
  }

  it("018/US2-3 018/FR-009 abre na chamada da 016: \"Aguardando chamada\" até marcar presentes", async () => {
    const { container } = setupDetail();
    expect((await screen.findByRole("tab", { name: "Chamada e prova" })).getAttribute("aria-selected")).toBe("true");
    const section = await screen.findByRole("region", { name: "Chamada" });
    expect(await within(section).findByRole("checkbox", { name: "Ana Souza" })).toBeTruthy();
    expect(screen.getAllByText("Aguardando chamada").length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it("018/US2-3 a confirmação da chamada nomeia a prova: \"Liberar a prova para 1 aluno?\"", async () => {
    const { user } = setupDetail();
    const section = await screen.findByRole("region", { name: "Chamada" });
    await user.click(await within(section).findByRole("checkbox", { name: "Ana Souza" }));
    await user.click(within(section).getByRole("button", { name: "Liberar para os presentes" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Liberar a prova para 1 aluno?" });
    expect(within(dialog).getByText("Os alunos marcados passam a ver a prova. Quem chegar depois pode ser marcado a qualquer momento.")).toBeTruthy();
  });

  it("018/FR-007 018/FR-010 Informações mostra a duração, a inatividade e os limites, sem prazo, modo editável nem ajuda", async () => {
    const { user } = setupDetail();
    await user.click(await screen.findByRole("tab", { name: "Informações" }));
    const term = (name: string) => screen.getByText(name, { selector: "dt" }).nextElementSibling!.textContent;
    expect(term("Tipo")).toBe("Prova");
    expect(term("Duração")).toBe("30 min");
    expect(term("Limite de inatividade")).toBe("45 s");
    expect(term("Limite para iniciar")).toMatch(/15 min após a abertura/);
    expect(term("Fechamento")).toBeTruthy();
    expect(screen.queryByText("Prazo", { selector: "dt" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Modo controlado/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Ajuda da IA/ })).toBeNull();
    expect(screen.getByText("Modo restrito")).toBeTruthy();
  });
});
