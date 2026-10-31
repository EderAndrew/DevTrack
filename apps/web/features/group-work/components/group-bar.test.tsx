import type { StudentGroup } from "@repo/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { apiError, json, routedFetch, studentActivity } from "@/features/student-activities/components/test-fixtures";
import { GroupBar } from "./group-bar";

// 023/US4 — the editing actions of the group bar: "Passar a edição" (the leader, a menu of the members),
// "Retomar a edição" (the leader, while a member edits) and "Devolver a edição" (the member editing).

const ANA = { id: "cccccccc-0000-4000-8000-000000000001", name: "Ana Souza" };
const BRUNO = { id: "cccccccc-0000-4000-8000-000000000002", name: "Bruno Lima" };
const CARLA = { id: "cccccccc-0000-4000-8000-000000000003", name: "Carla Dias" };
const ACTIVITY_ID = studentActivity().id;
const EDITING = `POST /api/me/activities/${ACTIVITY_ID}/group/editing`;

const group = (overrides: Partial<StudentGroup> = {}): StudentGroup => ({
  groupSize: 4,
  leader: ANA,
  members: [ANA, BRUNO, CARLA],
  editor: ANA,
  myRole: "LEADER",
  canEdit: true,
  addedBy: null,
  freeSlots: 1,
  version: 1,
  ...overrides,
});

function setup(value: StudentGroup, routes: Parameters<typeof routedFetch>[0] = {}, open = true) {
  const api = routedFetch(routes);
  vi.stubGlobal("fetch", vi.fn(api.fetch));
  const view = renderWithProviders(<GroupBar activityId={ACTIVITY_ID} group={value} open={open} />);
  return { ...view, api, user: userEvent.setup() };
}
const sentBodies = (api: ReturnType<typeof routedFetch>) =>
  api.calls.filter((call) => `${call.method} ${call.url}` === EDITING).map((call) => JSON.parse(String(call.body)));

describe("023/US4 ações da edição na barra do grupo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("023/US4-1 \"Passar a edição\" (só o líder) lista os integrantes e envia HAND; teclado e axe", async () => {
    const after = studentActivity({ groupSize: 4, group: group({ editor: BRUNO, canEdit: false }) });
    const { user, api, container } = setup(group(), { [EDITING]: json(200, after) });
    expect(screen.queryByRole("button", { name: "Retomar a edição" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Devolver a edição" })).toBeNull();
    await expectNoA11yViolations(container);

    const trigger = screen.getByRole("button", { name: "Passar a edição" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const items = await screen.findAllByRole("menuitem");
    // The leader editing: the other members, never the leader.
    expect(items.map((item) => item.textContent)).toEqual(["Bruno Lima", "Carla Dias"]);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(sentBodies(api)).toEqual([{ action: "HAND", toUserId: BRUNO.id }]));
  });

  it("023/US4-2 \"Retomar a edição\" com um integrante editando; o menu deixa de fora quem já edita", async () => {
    const { user, api } = setup(group({ editor: BRUNO, canEdit: false }), { [EDITING]: json(200, studentActivity()) });
    await user.click(screen.getByRole("button", { name: "Retomar a edição" }));
    await waitFor(() => expect(sentBodies(api)).toEqual([{ action: "TAKE_BACK" }]));
    await user.click(screen.getByRole("button", { name: "Passar a edição" }));
    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual(["Carla Dias"]);
  });

  it("023/US4-4 \"Devolver a edição\" só para o integrante que edita", async () => {
    const { user, api, container } = setup(group({ editor: BRUNO, myRole: "MEMBER", canEdit: true, addedBy: ANA }), {
      [EDITING]: json(200, studentActivity()),
    });
    expect(screen.queryByRole("button", { name: "Passar a edição" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retomar a edição" })).toBeNull();
    await expectNoA11yViolations(container);
    const button = screen.getByRole("button", { name: "Devolver a edição" });
    button.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(sentBodies(api)).toEqual([{ action: "RETURN" }]));
  });

  it("023/US4-4 quem só lê não vê ações; nada depois do fim; uma recusa mostra o motivo da API", async () => {
    const reader = setup(group({ editor: BRUNO, myRole: "MEMBER", canEdit: false, addedBy: ANA }));
    expect(reader.container.querySelectorAll("button")).toHaveLength(0);
    reader.unmount();
    const ended = setup(group({ editor: BRUNO, canEdit: false }), {}, false);
    expect(ended.container.querySelectorAll("button")).toHaveLength(0);
    ended.unmount();

    const { user } = setup(group(), { [EDITING]: apiError(422, "GROUP_MEMBER_NOT_AVAILABLE", "x") });
    await user.click(screen.getByRole("button", { name: "Passar a edição" }));
    await user.click((await screen.findAllByRole("menuitem"))[0]!);
    expect(await screen.findByText("Este integrante não pode receber a edição agora.")).toBeTruthy();
  });
});

// 023/US5 — "Incluir integrantes": only the leader, while the attempt is open and the group has free slots;
// the same checklist of the start with "Você pode incluir até <vagas>".
describe("023/US5 incluir integrantes", () => {
  const DAVI = { id: "cccccccc-0000-4000-8000-000000000004", name: "Davi Rocha" };
  const EVA = { id: "cccccccc-0000-4000-8000-000000000005", name: "Eva Nunes" };
  const CANDIDATES = `GET /api/me/activities/${ACTIVITY_ID}/group/candidates`;
  const MEMBERS = `POST /api/me/activities/${ACTIVITY_ID}/group/members`;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("023/US5-1 o líder abre \"Incluir integrantes\": a lista com \"Você pode incluir até <vagas>\" e envia os escolhidos", async () => {
    const after = studentActivity({ groupSize: 4, group: group({ members: [ANA, BRUNO, CARLA, DAVI], freeSlots: 0 }) });
    const { user, api } = setup(group(), {
      [CANDIDATES]: json(200, { groupSize: 4, freeSlots: 1, candidates: [DAVI, EVA] }),
      [MEMBERS]: json(200, after),
    });
    await user.click(screen.getByRole("button", { name: "Incluir integrantes" }));
    const dialog = await screen.findByRole("dialog", { name: "Incluir integrantes" });
    expect(await screen.findByText("Você pode incluir até 1.")).toBeTruthy();
    // No "Continuar sozinho" here: the group already exists.
    expect(screen.queryByRole("button", { name: "Continuar sozinho" })).toBeNull();
    await user.click(screen.getByLabelText("Davi Rocha"));
    // At the limit the other boxes are disabled.
    expect((screen.getByLabelText("Eva Nunes") as HTMLInputElement).disabled).toBe(true);
    await expectNoA11yViolations(dialog);
    await user.click(screen.getByRole("button", { name: "Incluir" }));
    await waitFor(() =>
      expect(api.calls.filter((call) => `${call.method} ${call.url}` === MEMBERS).map((call) => JSON.parse(String(call.body)))).toEqual([
        { memberIds: [DAVI.id] },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("023/US5-2 com o grupo cheio a opção some; 023/US5-3 um integrante nunca a vê; nada depois do fim", () => {
    const full = setup(group({ members: [ANA, BRUNO, CARLA, DAVI], freeSlots: 0 }));
    expect(screen.queryByRole("button", { name: "Incluir integrantes" })).toBeNull();
    full.unmount();
    const member = setup(group({ editor: BRUNO, myRole: "MEMBER", canEdit: true, addedBy: ANA }));
    expect(screen.queryByRole("button", { name: "Incluir integrantes" })).toBeNull();
    member.unmount();
    setup(group(), {}, false);
    expect(screen.queryByRole("button", { name: "Incluir integrantes" })).toBeNull();
  });

  it("023/US5-2 uma recusa (409 GROUP_FULL) mostra o motivo da API e mantém a lista aberta", async () => {
    const { user } = setup(group(), {
      [CANDIDATES]: json(200, { groupSize: 4, freeSlots: 1, candidates: [DAVI] }),
      [MEMBERS]: apiError(409, "GROUP_FULL", "x"),
    });
    await user.click(screen.getByRole("button", { name: "Incluir integrantes" }));
    await user.click(await screen.findByLabelText("Davi Rocha"));
    await user.click(screen.getByRole("button", { name: "Incluir" }));
    expect(await screen.findByText("O grupo já tem o máximo de integrantes deste trabalho.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Incluir integrantes" })).toBeTruthy();
  });
});
