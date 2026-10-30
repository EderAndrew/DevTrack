import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ActivityDetail } from "./activity-detail";
import { NEW_ACTIVITY_FIELD_IDS, NewActivity } from "./new-activity";
import { ACTIVITY_ID, activity, apiError, ATTEMPT_ID, CLASS_ID, EXERCISES, json, routedFetch, schoolClass, WORK } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
const AVAILABLE = { available: true, reason: null };
const field = (id: string) => document.getElementById(id) as HTMLInputElement;

function setupNew() {
  const api = routedFetch({
    [`GET /api/classes/${CLASS_ID}`]: json(200, schoolClass()),
    "GET /api/work-help/availability": json(200, AVAILABLE),
    "GET /api/works?*": json(200, { items: [WORK], nextCursor: null }),
    "GET /api/exercises?*": json(200, { items: EXERCISES, nextCursor: null }),
    [`POST /api/classes/${CLASS_ID}/activities/scope-check`]: json(200, { hasPlan: true, outOfScope: [] }),
    [`POST /api/classes/${CLASS_ID}/activities`]: json(201, activity()),
  });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<NewActivity classId={CLASS_ID} />);
  return { ...view, api, user: userEvent.setup() };
}

async function chooseWork(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("radio", { name: /Trabalho de herança/ }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByRole("form", { name: "Dados da atividade" });
}

function setupDetail(routes: Parameters<typeof routedFetch>[0] = {}) {
  const api = routedFetch({ "GET /api/work-help/availability": json(200, AVAILABLE), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<ActivityDetail classId={CLASS_ID} activityId={ACTIVITY_ID} canApply canRelease={false} />);
  return { ...view, api, user: userEvent.setup() };
}

const formatGroup = () => screen.getByRole("group", { name: "Formato" });
const individual = () => within(formatGroup()).getByRole("radio", { name: "Individual" }) as HTMLInputElement;
const inGroup = () => within(formatGroup()).getByRole("radio", { name: "Em grupo" }) as HTMLInputElement;
const maximum = () => screen.queryByRole("combobox", { name: "Máximo de integrantes, com o líder" }) as HTMLSelectElement | null;
const withAttendance = (overrides: Parameters<typeof activity>[0] = {}) =>
  activity({ releaseMode: "PRESENT_ONLY", attendance: { present: 1, enrolled: 1 }, ...overrides });

describe("023/US1 Formato do Trabalho — Individual ou Em grupo", () => {
  beforeEach(() => router.push.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("023/US1-1 \"Formato\" vem com \"Individual\" marcado e o pedido leva groupSize null", async () => {
    const { api, user } = setupNew();
    await chooseWork(user);
    expect(individual().checked).toBe(true);
    expect(inGroup().checked).toBe(false);
    expect(maximum()).toBeNull();
    fireEvent.change(field(NEW_ACTIVITY_FIELD_IDS.deadline), { target: { value: "2030-10-10T23:59" } });
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    await waitFor(() => expect(api.writes()).toHaveLength(2));
    expect(api.writes()[1]!.body).toMatchObject({ groupSize: null });
  });

  it("023/US1-2 \"Em grupo\" mostra o máximo de 2 a 5 (padrão 3) e envia groupSize", async () => {
    const { api, user } = setupNew();
    await chooseWork(user);
    await user.click(inGroup());
    const select = maximum()!;
    expect(select.value).toBe("3");
    expect([...select.options].map((option) => option.value)).toEqual(["2", "3", "4", "5"]);
    await user.selectOptions(select, "4");
    fireEvent.change(field(NEW_ACTIVITY_FIELD_IDS.deadline), { target: { value: "2030-10-10T23:59" } });
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    await waitFor(() => expect(api.writes()).toHaveLength(2));
    expect(api.writes()[1]!.body).toMatchObject({ groupSize: 4 });
  });

  it("023/US1-5 o Exercício não tem formato, nem no pedido", async () => {
    const { api, user } = setupNew();
    await user.click(await screen.findByRole("radio", { name: "Exercício" }));
    await user.click(await screen.findByRole("checkbox", { name: /O que é polimorfismo/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByRole("form", { name: "Dados da atividade" });
    expect(screen.queryByRole("group", { name: "Formato" })).toBeNull();
    await user.type(field(NEW_ACTIVITY_FIELD_IDS.title), "Prática");
    await user.click(screen.getByRole("button", { name: "Publicar atividade" }));
    await waitFor(() => expect(api.writes()).toHaveLength(2));
    expect(api.writes()[1]!.body as object).not.toHaveProperty("groupSize");
  });

  it("023/US1-2 SC-012 passo 2 com \"Em grupo\" sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setupNew();
    await chooseWork(user);
    await user.click(inGroup());
    const help = screen.getByRole("checkbox", { name: "Ajuda da IA (3 perguntas por aluno)" }) as HTMLInputElement;
    await waitFor(() => expect(help.disabled).toBe(false));
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      field(NEW_ACTIVITY_FIELD_IDS.title),
      field(NEW_ACTIVITY_FIELD_IDS.instructions),
      screen.getByRole("radio", { name: "Publicar agora" }),
      field(NEW_ACTIVITY_FIELD_IDS.deadline),
      screen.getByRole("radio", { name: "Não aceitar" }),
      inGroup(),
      maximum()!,
      screen.getByRole("checkbox", { name: "Modo controlado" }),
      help,
      screen.getByRole("button", { name: "Publicar atividade" }),
      screen.getByRole("button", { name: "Voltar" }),
    ]);
  });

  it("023/US1-4 na edição, antes do início: muda para Em grupo e o pedido leva só groupSize", async () => {
    const { api, user } = setupDetail({ [`GET ${PATH}`]: json(200, withAttendance()), [`PATCH ${PATH}`]: json(200, withAttendance({ groupSize: 5 })) });
    await screen.findByRole("form", { name: "Editar atividade" });
    expect(individual().checked).toBe(true);
    await user.click(inGroup());
    await user.selectOptions(maximum()!, "5");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Alterações salvas.")).toBeTruthy();
    expect(api.writes()[0]!.body).toEqual({ version: 2, groupSize: 5 });
  });

  it("023/US1-4 na edição, de volta a Individual: groupSize null", async () => {
    const { api, user } = setupDetail({ [`GET ${PATH}`]: json(200, withAttendance({ groupSize: 4 })), [`PATCH ${PATH}`]: json(200, withAttendance()) });
    await screen.findByRole("form", { name: "Editar atividade" });
    expect(inGroup().checked).toBe(true);
    expect(maximum()!.value).toBe("4");
    await user.click(individual());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Alterações salvas.");
    expect(api.writes()[0]!.body).toEqual({ version: 2, groupSize: null });
  });

  it("023/US1-4 depois que um aluno iniciou: formato travado com a mensagem da 015 e fora do pedido", async () => {
    const started = withAttendance({ groupSize: 3, roster: [{ ...activity().roster[0]!, status: "IN_PROGRESS", attemptId: ATTEMPT_ID }] });
    const { api, user } = setupDetail({ [`GET ${PATH}`]: json(200, started), [`PATCH ${PATH}`]: json(200, started) });
    await screen.findByRole("form", { name: "Editar atividade" });
    const reasons = within(formatGroup()).getAllByText("Não é possível mudar depois que um aluno iniciou.");
    expect(reasons).toHaveLength(1);
    expect(formatGroup().getAttribute("aria-describedby")).toBe(reasons[0]!.id);
    expect(individual().disabled).toBe(true);
    expect(inGroup().disabled).toBe(true);
    expect(maximum()!.disabled).toBe(true);
    await user.type(document.getElementById("editar-titulo") as HTMLInputElement, " revisado");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Alterações salvas.");
    expect(api.writes()[0]!.body as object).not.toHaveProperty("groupSize");
  });

  it("023/FR-002 trabalho sem chamada (anterior à 016): sem formato na edição; a recusa do servidor tem mensagem", async () => {
    const { user } = setupDetail({
      [`GET ${PATH}`]: json(200, activity()),
      [`PATCH ${PATH}`]: apiError(422, "GROUP_NEEDS_ATTENDANCE", "Este trabalho foi aplicado sem chamada e só pode ser individual."),
    });
    await screen.findByRole("form", { name: "Editar atividade" });
    expect(screen.queryByRole("group", { name: "Formato" })).toBeNull();
    // The server's refusal still reaches the summary (another tab may have changed it).
    await user.type(document.getElementById("editar-titulo") as HTMLInputElement, " revisado");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    const summary = (await screen.findByText("Não foi possível salvar")).closest("[role=group]") as HTMLElement;
    expect(within(summary).getByText("Este trabalho foi aplicado sem chamada e só pode ser individual.")).toBeTruthy();
  });

  it("023/US1-2 o detalhe mostra \"Em grupo (até N)\"; o individual não", async () => {
    setupDetail({ [`GET ${PATH}`]: json(200, withAttendance({ groupSize: 4 })) });
    expect(await screen.findByText("Em grupo (até 4)")).toBeTruthy();
  });

  it("023/US1-4 SC-012 edição com \"Em grupo\" sem violações de acessibilidade", async () => {
    const { container } = setupDetail({ [`GET ${PATH}`]: json(200, withAttendance({ groupSize: 2 })) });
    await screen.findByRole("form", { name: "Editar atividade" });
    await expectNoA11yViolations(container);
  });
});
