import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { SubjectForm } from "./subject-form";
import { apiError, json, subjectView } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NAME_TAKEN = "Você já tem uma disciplina com este nome.";
const POO = subjectView("Programação Orientada a Objetos", { description: "Classes e objetos." });

describe("004/US1-1 004/US1-2 SubjectForm (FR-002)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sentBody = (call: number) => JSON.parse(String(fetchMock.mock.calls[call]![1]!.body)) as unknown;

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("cria a disciplina e abre a página dela com o aviso; descrição vazia vai como null", async () => {
    fetchMock.mockResolvedValueOnce(json(201, POO));
    const { container } = renderWithProviders(<SubjectForm />);
    const user = userEvent.setup();
    await expectNoA11yViolations(container);

    await user.type(screen.getByLabelText(/^Nome/), POO.name);
    await user.click(screen.getByRole("button", { name: "Criar disciplina" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith(`/disciplinas/${POO.id}?criada=1`));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/subjects");
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("POST");
    expect(sentBody(0)).toEqual({ name: POO.name, description: null });
    expect(screen.getByRole("link", { name: "Cancelar" }).getAttribute("href")).toBe("/disciplinas");
  });

  it("nome vazio: erro junto ao campo e no resumo, sem chamar a API", async () => {
    const { container } = renderWithProviders(<SubjectForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Criar disciplina" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível criar a disciplina" });
    expect(summary.textContent).toContain("Informe o nome da disciplina.");
    expectFieldErrorLinked(screen.getByLabelText(/^Nome/));
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it("SUBJECT_NAME_TAKEN aparece no campo Nome", async () => {
    fetchMock.mockResolvedValueOnce(apiError(409, "SUBJECT_NAME_TAKEN", NAME_TAKEN));
    renderWithProviders(<SubjectForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "algoritmos ");
    await user.click(screen.getByRole("button", { name: "Criar disciplina" }));

    const name = screen.getByLabelText(/^Nome/);
    await vi.waitFor(() => expectFieldErrorLinked(name));
    expect(document.getElementById("nome-erro")!.textContent).toBe(NAME_TAKEN);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("edita: vem preenchido, envia PATCH e avisa quem abriu o formulário", async () => {
    const saved = { ...POO, name: "POO Avançada" };
    fetchMock.mockResolvedValueOnce(json(200, saved));
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(<SubjectForm initial={POO} onSaved={onSaved} onCancel={onCancel} />);
    const user = userEvent.setup();

    const name = screen.getByLabelText(/^Nome/) as HTMLInputElement;
    expect(name.value).toBe(POO.name);
    expect((screen.getByLabelText("Descrição") as HTMLTextAreaElement).value).toBe("Classes e objetos.");
    await user.clear(name);
    await user.type(name, "POO Avançada");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/subjects/${POO.id}`);
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("PATCH");
    expect(sentBody(0)).toEqual({ name: "POO Avançada", description: "Classes e objetos." });
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("004/SC-012 — SubjectForm só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ordem de tabulação e envio com Enter; erro da API com foco no resumo", async () => {
    fetchMock.mockResolvedValueOnce(apiError(409, "SUBJECT_NAME_TAKEN", NAME_TAKEN));
    renderWithProviders(<SubjectForm />);
    const user = userEvent.setup();
    const name = screen.getByLabelText(/^Nome/);

    await expectTabOrder(user, [
      name,
      screen.getByLabelText("Descrição"),
      screen.getByRole("button", { name: "Criar disciplina" }),
      screen.getByRole("link", { name: "Cancelar" }),
    ]);

    await tabTo(user, name);
    await user.keyboard("Redes{Enter}");
    expect(await screen.findByRole("group", { name: "Não foi possível criar a disciplina" })).toBe(document.activeElement);
  });
});
