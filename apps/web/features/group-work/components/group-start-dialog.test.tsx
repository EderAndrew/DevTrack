import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ApiError } from "@/lib/api/client";
import { json, routedFetch } from "../../student-activities/components/test-fixtures";
import { GroupStartDialog } from "./group-start-dialog";

const ACTIVITY_ID = "aaaaaaaa-0000-4000-8000-000000000123";
const CANDIDATES = `GET /api/me/activities/${ACTIVITY_ID}/group/candidates`;
const BRUNO = { id: "cccccccc-0000-4000-8000-000000000002", name: "Bruno Lima" };
const CARLA = { id: "cccccccc-0000-4000-8000-000000000003", name: "Carla Dias" };
const DAVI = { id: "cccccccc-0000-4000-8000-000000000004", name: "Davi Rocha" };
const XSS = { id: "cccccccc-0000-4000-8000-000000000005", name: '<img src=x onerror="alert(1)">Eva' };

function setup(responses: Response[], onStart = vi.fn().mockResolvedValue(undefined)) {
  let call = 0;
  const api = routedFetch({ [CANDIDATES]: () => responses[Math.min(call++, responses.length - 1)]!.clone() });
  vi.stubGlobal("fetch", api.fetch);
  const onOpenChange = vi.fn();
  const view = renderWithProviders(<GroupStartDialog activityId={ACTIVITY_ID} open onOpenChange={onOpenChange} onStart={onStart} />);
  return { ...view, api, onStart, onOpenChange, user: userEvent.setup() };
}

const list = (freeSlots: number, candidates = [BRUNO, CARLA, DAVI]) => json(200, { groupSize: freeSlots + 1, freeSlots, candidates });
const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const startGroupButton = () => screen.getByRole("button", { name: "Iniciar em grupo" }) as HTMLButtonElement;

describe("023/US2 GroupStartDialog — escolher os integrantes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("023/US2-1 a mensagem com o limite, os colegas em ordem e \"Continuar sozinho\"", async () => {
    const { onStart, user } = setup([list(3)]);
    const dialog = await screen.findByRole("dialog", { name: "Trabalho em grupo" });
    expect(await within(dialog).findByText("Esse trabalho é em grupo, escolha os integrantes do grupo. Você pode incluir até 3.")).toBeTruthy();
    expect(within(dialog).getAllByRole("checkbox").map((item) => item.getAttribute("aria-label") ?? (item as HTMLInputElement).labels?.[0]?.textContent)).toEqual([
      "Bruno Lima",
      "Carla Dias",
      "Davi Rocha",
    ]);
    await user.click(screen.getByRole("button", { name: "Continuar sozinho" }));
    expect(onStart).toHaveBeenCalledWith({ alone: true });
  });

  it("023/US2-2 023/US2-3 \"n de N\", o limite desabilita as caixas desmarcadas, e o pedido leva os escolhidos", async () => {
    const { onStart, user } = setup([list(2)]);
    await screen.findByRole("checkbox", { name: "Bruno Lima" });
    expect(screen.getByText("0 de 2")).toBeTruthy();
    expect(startGroupButton().disabled).toBe(true);
    await user.click(box("Carla Dias"));
    expect(startGroupButton().disabled).toBe(false);
    await user.click(box("Bruno Lima"));
    expect(screen.getByText("2 de 2")).toBeTruthy();
    expect(box("Davi Rocha").disabled).toBe(true);
    expect(box("Bruno Lima").disabled).toBe(false);
    await user.click(startGroupButton());
    expect(onStart).toHaveBeenCalledWith({ memberIds: [BRUNO.id, CARLA.id] });
  });

  it("023/US2-5 o 409 relê a lista e o aviso nomeia quem saiu; os outros continuam marcados", async () => {
    const refusal = new ApiError(409, "GROUP_MEMBERS_UNAVAILABLE", "x", null, { unavailableIds: [BRUNO.id] });
    const onStart = vi.fn().mockRejectedValueOnce(refusal).mockResolvedValue(undefined);
    const { api, user } = setup([list(3), list(3, [CARLA, DAVI])], onStart);
    await user.click(await screen.findByRole("checkbox", { name: "Bruno Lima" }));
    await user.click(box("Carla Dias"));
    await user.click(startGroupButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Bruno Lima não está mais disponível.");
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Bruno Lima" })).toBeNull());
    expect(api.calls.filter((call) => call.url.endsWith("/group/candidates"))).toHaveLength(2);
    expect(box("Carla Dias").checked).toBe(true);
    expect(screen.getByText("1 de 3")).toBeTruthy();
    await user.click(startGroupButton());
    expect(onStart).toHaveBeenLastCalledWith({ memberIds: [CARLA.id] });
  });

  it("023/US2-6 sem colegas: \"Nenhum colega disponível agora.\" e só \"Continuar sozinho\"", async () => {
    setup([list(3, [])]);
    expect(await screen.findByText("Nenhum colega disponível agora.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Iniciar em grupo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continuar sozinho" })).toBeTruthy();
  });

  it("023/US2-1 outra recusa aparece no aviso com a mensagem do catálogo", async () => {
    const onStart = vi.fn().mockRejectedValue(new ApiError(409, "ACTIVITY_CLOSED", "x"));
    const { user } = setup([list(3)], onStart);
    await user.click(await screen.findByRole("checkbox", { name: "Bruno Lima" }));
    await user.click(startGroupButton());
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("023/FR-026 nomes com HTML aparecem como texto", async () => {
    const { container } = setup([list(3, [XSS])]);
    expect(await screen.findByRole("checkbox", { name: XSS.name })).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("<img");
  });

  it("023/US2-1 SC-012 sem violações de acessibilidade, na ordem de Tab, e Esc fecha sem iniciar", async () => {
    const { onStart, onOpenChange, user } = setup([list(3)]);
    await screen.findByRole("checkbox", { name: "Bruno Lima" });
    await expectNoA11yViolations(document.body);
    box("Bruno Lima").focus();
    await expectTabOrder(user, [box("Bruno Lima"), box("Carla Dias"), box("Davi Rocha"), screen.getByRole("button", { name: "Continuar sozinho" })]);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onStart).not.toHaveBeenCalled();
  });
});
