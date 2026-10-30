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
