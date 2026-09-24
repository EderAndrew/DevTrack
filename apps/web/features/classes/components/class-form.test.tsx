import type { ClassView } from "@repo/contracts";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ClassForm } from "./class-form";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

const CLASS: ClassView = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Programação Orientada a Objetos",
  code: "POO-2026-01",
  academicYear: 2026,
  period: "2º semestre",
  description: null,
  status: "ACTIVE",
  activeStudentCount: 0,
  subject: null,
  startsOn: null,
  endsOn: null,
  plannable: false,
  planStatus: null,
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
};

const sentBody = (call: number, fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) =>
  JSON.parse(String(fetchMock.mock.calls[call]![1]!.body)) as unknown;

describe("003/US1-1 003/US1-3 ClassForm (FR-001, FR-003)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("cria a turma e vai para a página dela; período e descrição vazios vão como null", async () => {
    fetchMock.mockResolvedValueOnce(json(201, CLASS));
    const { container } = renderWithProviders(<ClassForm />);
    const user = userEvent.setup();
    await expectNoA11yViolations(container);

    await user.type(screen.getByLabelText(/^Nome/), CLASS.name);
    await user.type(screen.getByLabelText(/^Código/), CLASS.code);
    await user.clear(screen.getByLabelText(/^Ano letivo/));
    await user.type(screen.getByLabelText(/^Ano letivo/), "2026");
    await user.click(screen.getByRole("button", { name: "Criar turma" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith(`/turmas/${CLASS.id}`));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/classes");
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("POST");
    expect(sentBody(0, fetchMock)).toEqual({
      name: CLASS.name,
      code: CLASS.code,
      academicYear: 2026,
      period: null,
      description: null,
    });
  });

  it("campos obrigatórios e inválidos: erros junto aos campos e no resumo, sem chamar a API", async () => {
    const { container } = renderWithProviders(<ClassForm />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/^Ano letivo/));
    await user.type(screen.getByLabelText(/^Código/), "POO 01");
    await user.click(screen.getByRole("button", { name: "Criar turma" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível criar a turma" });
    expect(summary.textContent).toContain("Informe o nome da turma.");
    expect(summary.textContent).toContain("Informe o ano letivo.");
    for (const label of [/^Nome/, /^Código/, /^Ano letivo/]) expectFieldErrorLinked(screen.getByLabelText(label));
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it("CLASS_CODE_TAKEN aparece no campo Código", async () => {
    fetchMock.mockResolvedValueOnce(apiError(409, "CLASS_CODE_TAKEN", "Você já tem uma turma com este código."));
    renderWithProviders(<ClassForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), CLASS.name);
    await user.type(screen.getByLabelText(/^Código/), "poo-2026-01");
    await user.click(screen.getByRole("button", { name: "Criar turma" }));

    const code = screen.getByLabelText(/^Código/);
    await vi.waitFor(() => expectFieldErrorLinked(code));
    expect(document.getElementById("codigo-erro")!.textContent).toBe("Você já tem uma turma com este código.");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("edita: vem preenchido, envia PATCH com os campos e volta para a turma", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ...CLASS, name: "POO Avançada" }));
    renderWithProviders(<ClassForm initial={CLASS} />);
    const user = userEvent.setup();

    const name = screen.getByLabelText(/^Nome/) as HTMLInputElement;
    expect(name.value).toBe(CLASS.name);
    expect((screen.getByLabelText(/^Período/) as HTMLInputElement).value).toBe("2º semestre");
    await user.clear(name);
    await user.type(name, "POO Avançada");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith(`/turmas/${CLASS.id}`));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/classes/${CLASS.id}`);
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("PATCH");
    expect(sentBody(0, fetchMock)).toEqual({
      name: "POO Avançada",
      code: CLASS.code,
      academicYear: 2026,
      period: "2º semestre",
      description: null,
    });
    expect(screen.getByRole("link", { name: "Cancelar" }).getAttribute("href")).toBe(`/turmas/${CLASS.id}`);
  });
});

describe("003/SC-011 SC-012 — ClassForm só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ordem de tabulação e envio com Enter; erro da API com foco no resumo", async () => {
    fetchMock.mockResolvedValueOnce(apiError(409, "CLASS_CODE_TAKEN", "Você já tem uma turma com este código."));
    renderWithProviders(<ClassForm />);
    const user = userEvent.setup();
    const name = screen.getByLabelText(/^Nome/);

    await expectTabOrder(user, [
      name,
      screen.getByLabelText(/^Código/),
      screen.getByLabelText(/^Ano letivo/),
      screen.getByLabelText(/^Período/),
      screen.getByLabelText("Descrição"),
      screen.getByRole("button", { name: "Criar turma" }),
      screen.getByRole("link", { name: "Cancelar" }),
    ]);

    await tabTo(user, name);
    await user.keyboard("Redes{Tab}REDES-1{Enter}");
    expect(await screen.findByRole("group", { name: "Não foi possível criar a turma" })).toBe(document.activeElement);
  });
});
