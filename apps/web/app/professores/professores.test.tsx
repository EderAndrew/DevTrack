import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherListItem } from "../../lib/admin-api";
import { expectNoA11yViolations } from "../../test/a11y";
import { TeachersAdmin } from "./teachers-admin";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const TEACHERS: TeacherListItem[] = [
  { userId: null, invitationId: "11111111-1111-4111-8111-111111111111", displayName: "Ana Convidada", email: "ana@example.test", status: "INVITED" },
  { userId: "22222222-2222-4222-8222-222222222222", invitationId: null, displayName: "Bruno Ativo", email: "bruno@example.test", status: "ACTIVE" },
  { userId: "33333333-3333-4333-8333-333333333333", invitationId: null, displayName: "Carla Suspensa", email: "carla@example.test", status: "SUSPENDED" },
  { userId: "44444444-4444-4444-8444-444444444444", invitationId: null, displayName: "Davi Inativo", email: "davi@example.test", status: "INACTIVE" },
];

describe("TeachersAdmin (US5, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const actionsOf = (name: string) =>
    within(screen.getByText(name).closest("tr")!)
      .queryAllByRole("button")
      .map((button) => button.textContent);

  it("oferece as ações de cada situação e não tem violações", async () => {
    const { container } = render(<TeachersAdmin initialTeachers={TEACHERS} />);
    expect(actionsOf("Ana Convidada")).toEqual(["Reenviar convite", "Revogar convite"]);
    expect(actionsOf("Bruno Ativo")).toEqual(["Suspender", "Desativar"]);
    expect(actionsOf("Carla Suspensa")).toEqual(["Reativar", "Desativar"]);
    expect(actionsOf("Davi Inativo")).toEqual(["Reativar"]);
    expect(within(screen.getByText("Ana Convidada").closest("tr")!).getByText("Convidado")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("convida enviando só {email, displayName} e recarrega a lista", async () => {
    fetchMock
      .mockResolvedValueOnce(json(201, { id: "x", email: "nova@example.test" }))
      .mockResolvedValueOnce(json(200, { items: TEACHERS }));
    render(<TeachersAdmin initialTeachers={[]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Nova Prof");
    await user.type(screen.getByLabelText(/^E-mail/), "nova@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    expect(fetchMock.mock.calls[0]![0]).toBe("/api/teacher-invitations");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ email: "nova@example.test", displayName: "Nova Prof" });
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/teachers");
    expect(await screen.findByText("Bruno Ativo")).toBeTruthy();
  });

  it.each([
    ["ALREADY_TEACHER", "Esta pessoa já é professora."],
    ["TEACHER_REACTIVATION_REQUIRED", "Use a reativação."],
  ])("%s aparece ligado ao e-mail, com foco no resumo", async (code, message) => {
    fetchMock.mockResolvedValueOnce(json(409, { statusCode: 409, code, message }));
    render(<TeachersAdmin initialTeachers={[]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "X");
    await user.type(screen.getByLabelText(/^E-mail/), "x@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível convidar" });
    expect(summary.textContent).toContain(message);
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText(/^E-mail/).getAttribute("aria-invalid")).toBe("true");
  });

  it("ações chamam a rota certa e o filtro refaz a consulta", async () => {
    fetchMock.mockResolvedValue(json(200, { items: TEACHERS }));
    render(<TeachersAdmin initialTeachers={TEACHERS} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Suspender: Bruno Ativo" }));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/teachers/${TEACHERS[1]!.userId}/suspend`);
    await user.click(screen.getByRole("button", { name: "Revogar convite: Ana Convidada" }));
    expect(fetchMock.mock.calls.some(([url]) => url === `/api/teacher-invitations/${TEACHERS[0]!.invitationId}/revoke`)).toBe(true);

    fetchMock.mockClear();
    await user.selectOptions(screen.getByLabelText("Situação"), "INACTIVE");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/teachers?status=INACTIVE");
  });
});
