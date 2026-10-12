import type { ClassInvitationView } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { InviteStudentDialog } from "./invite-student-dialog";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

const CLASS_ID = "33333333-3333-4333-8333-333333333333";
const INVITATION: ClassInvitationView = {
  id: "44444444-4444-4444-8444-444444444444",
  email: "aluno@example.test",
  status: "PENDING",
  expiresAt: "2026-09-30T12:00:00.000Z",
  sendCount: 1,
  lastSentAt: "2026-09-23T12:00:00.000Z",
  delivery: "SENDING",
  deliveryIssue: null,
  createdAt: "2026-09-23T12:00:00.000Z",
};

describe("003/US2-1 003/US2-2 003/US2-3 003/US2-4 InviteStudentDialog (FR-010, FR-011)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const open = async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<InviteStudentDialog classId={CLASS_ID} />);
    const trigger = screen.getByRole("button", { name: "Convidar aluno" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Convidar aluno" });
    return { user, trigger, dialog, container };
  };

  it("abre com foco no e-mail, envia só o e-mail e mostra \"Convite enviado.\" com o foco de volta no botão", async () => {
    fetchMock.mockResolvedValueOnce(json(201, INVITATION));
    const { user, trigger, dialog } = await open();

    const email = within(dialog).getByLabelText(/^E-mail/);
    expect(document.activeElement).toBe(email);
    await expectNoA11yViolations(document.body);

    await user.type(email, "  Aluno@Example.test ");
    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));

    expect(await screen.findByText("Convite enviado.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/classes/${CLASS_ID}/invitations`);
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ email: "aluno@example.test" });
  });

  it("e-mail vazio ou inválido: erro junto ao campo e no resumo, sem chamar a API", async () => {
    const { user, dialog } = await open();
    const email = within(dialog).getByLabelText(/^E-mail/);

    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));
    const summary = await within(dialog).findByRole("group", { name: "Não foi possível enviar o convite" });
    expect(summary.textContent).toContain("Informe o e-mail do aluno.");
    expectFieldErrorLinked(email);

    await user.type(email, "nao-e-email");
    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));
    await waitFor(() => expect(summary.textContent).toContain("Dados inválidos."));
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(document.body);
  });

  it.each([
    ["INVITATION_ALREADY_PENDING", "Já existe um convite pendente para este e-mail."],
    ["ALREADY_ENROLLED", "Este aluno já está matriculado nesta turma."],
  ])("%s aparece junto ao campo E-mail e o diálogo continua aberto", async (code, text) => {
    fetchMock.mockResolvedValueOnce(apiError(409, code, "Mensagem da API."));
    const { user, dialog } = await open();
    const email = within(dialog).getByLabelText(/^E-mail/);
    await user.type(email, "aluno@example.test");
    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));

    await waitFor(() => expectFieldErrorLinked(email));
    expect(document.getElementById("email-convite-erro")!.textContent).toContain(text);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("Convite enviado.")).toBeNull();
  });

  it("turma que não aceita alunos: mensagem só no resumo", async () => {
    fetchMock.mockResolvedValueOnce(apiError(409, "CLASS_NOT_OPEN", "Mensagem da API."));
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText(/^E-mail/), "aluno@example.test");
    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));

    const summary = await within(dialog).findByRole("group", { name: "Não foi possível enviar o convite" });
    expect(summary.textContent).toContain("Esta turma não aceita novos alunos.");
    expect(document.activeElement).toBe(summary);
  });
});

describe("003/SC-011 SC-012 — InviteStudentDialog só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("foco preso no diálogo; Esc fecha e devolve o foco; Enter envia", async () => {
    fetchMock.mockResolvedValueOnce(json(201, INVITATION));
    const user = userEvent.setup();
    renderWithProviders(<InviteStudentDialog classId={CLASS_ID} />);
    const trigger = screen.getByRole("button", { name: "Convidar aluno" });

    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Convidar aluno" });
    const email = within(dialog).getByLabelText(/^E-mail/);
    expect(document.activeElement).toBe(email);

    // Tab cycles inside the dialog only.
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(fetchMock).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    const reopened = await screen.findByRole("dialog", { name: "Convidar aluno" });
    await user.type(within(reopened).getByLabelText(/^E-mail/), "aluno@example.test{Enter}");
    expect(await screen.findByText("Convite enviado.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
