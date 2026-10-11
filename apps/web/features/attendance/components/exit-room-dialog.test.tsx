import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { formatLongDateTime } from "@/lib/messages/dates";
import { expectNoA11yViolations } from "../../../test/a11y";
import { tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { CONFIRM_EXIT, EXIT_NOTE_LABEL, EXIT_OFFLINE, EXIT_ROOM_NOTICE } from "../schemas/attendance";
import { ExitRoomDialog } from "./exit-room-dialog";

const DEADLINE = "2026-10-02T17:00:00.000Z";

function setup(onConfirm = vi.fn(async () => {})) {
  const onOpenChange = vi.fn();
  const view = renderWithProviders(<ExitRoomDialog open onOpenChange={onOpenChange} deadline={DEADLINE} onConfirm={onConfirm} />);
  return { ...view, onConfirm, onOpenChange, user: userEvent.setup() };
}

const online = (value: boolean) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
};

describe("016/US3 ExitRoomDialog — \"Sair da sala\"", () => {
  afterEach(() => vi.restoreAllMocks());

  it("016/US3-1 016/FR-011 os motivos da lista fechada, o aviso de pausa e de prazo, e a confirmação por ação explícita", async () => {
    const { user, onConfirm } = setup();
    const dialog = await screen.findByRole("dialog", { name: "Sair da sala" });
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label") ?? radio.closest("label")?.textContent)).toEqual([
      "Ir ao banheiro",
      "Beber água",
      "Atender o telefone",
      "Outro",
    ]);
    expect(dialog.textContent).toContain(EXIT_ROOM_NOTICE);
    expect(dialog.textContent).toContain(`Prazo: ${formatLongDateTime(DEADLINE)}`);
    // Nothing is chosen for the student: the confirmation waits for a reason.
    expect((screen.getByRole("button", { name: CONFIRM_EXIT }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText(EXIT_NOTE_LABEL)).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Beber água" }));
    await user.click(screen.getByRole("button", { name: CONFIRM_EXIT }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "WATER" });
  });

  it("016/FR-011 \"Outro\" abre um texto opcional de até 200 caracteres, enviado só com conteúdo", async () => {
    const { user, onConfirm } = setup();
    await user.click(await screen.findByRole("radio", { name: "Outro" }));
    const note = screen.getByLabelText(EXIT_NOTE_LABEL) as HTMLTextAreaElement;
    expect(note.maxLength).toBe(200);
    await user.click(screen.getByRole("button", { name: CONFIRM_EXIT }));
    expect(onConfirm).toHaveBeenLastCalledWith({ reason: "OTHER" });

    await user.type(note, "  <b>Buscar o carregador</b>  ");
    await user.click(screen.getByRole("button", { name: CONFIRM_EXIT }));
    expect(onConfirm).toHaveBeenLastCalledWith({ reason: "OTHER", note: "<b>Buscar o carregador</b>" });
  });

  it("016/FR-023 sem conexão: \"Sem conexão. Avise o professor antes de sair.\" no lugar do botão de confirmar", async () => {
    const { onConfirm } = setup();
    await screen.findByRole("dialog");
    online(false);
    expect(screen.getByText(EXIT_OFFLINE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: CONFIRM_EXIT })).toBeNull();
    online(true);
    expect(screen.getByRole("button", { name: CONFIRM_EXIT })).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("016/FR-023 a recusa do servidor aparece no diálogo, que continua aberto", async () => {
    const { user, onOpenChange } = setup(vi.fn(async () => Promise.reject(new ApiError(409, "ACTIVITY_CLOSED", "Encerrada."))));
    await user.click(await screen.findByRole("radio", { name: "Atender o telefone" }));
    await user.click(screen.getByRole("button", { name: CONFIRM_EXIT }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/encerrada/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("016/FR-023 axe e teclado: o motivo pelas setas, Tab até \"Confirmar saída\" e Enter confirma", async () => {
    const { user, onConfirm, baseElement } = setup();
    await screen.findByRole("dialog");
    await expectNoA11yViolations(baseElement);
    await tabTo(user, screen.getByRole("radio", { name: "Ir ao banheiro" }));
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect((screen.getByRole("radio", { name: "Beber água" }) as HTMLInputElement).checked).toBe(true));
    await tabTo(user, screen.getByRole("button", { name: CONFIRM_EXIT }));
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledWith({ reason: "WATER" });
  });
});
