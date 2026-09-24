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

const POO_SUBJECT = { id: "33333333-3333-4333-8333-333333333333", name: "Programação Orientada a Objetos" };
const SUBJECTS = [
  {
    ...POO_SUBJECT,
    description: null,
    status: "ACTIVE",
    classCount: 0,
    documentCount: 0,
    createdAt: "2026-09-21T12:00:00.000Z",
    updatedAt: "2026-09-21T12:00:00.000Z",
  },
];

/**
 * The form loads the active subjects for the Disciplina select: those GETs are answered here and
 * kept out of `fetchMock`, whose calls are the form's own requests.
 */
function stubFetch(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, subjects: unknown[] = SUBJECTS) {
  const subjectCalls: string[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/subjects")) {
      subjectCalls.push(url);
      return Promise.resolve(json(200, { items: subjects, nextCursor: null }));
    }
    return fetchMock(input, init);
  });
  return subjectCalls;
}

describe("003/US1-1 003/US1-3 ClassForm (FR-001, FR-003)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    stubFetch(fetchMock);
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
      subjectId: null,
      startsOn: null,
      endsOn: null,
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
      subjectId: null,
      startsOn: null,
      endsOn: null,
    });
    expect(screen.getByRole("link", { name: "Cancelar" }).getAttribute("href")).toBe(`/turmas/${CLASS.id}`);
  });
});

describe("004/US1-3 004/US1-4 004/US1-5 ClassForm — disciplina e datas da oferta", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/^Nome/), "POO — Turma A");
    await user.type(screen.getByLabelText(/^Código/), "POO-A");
  };

  it("cria com disciplina (só ativas), período e datas", async () => {
    const subjectCalls = stubFetch(fetchMock);
    fetchMock.mockResolvedValueOnce(json(201, CLASS));
    const { container } = renderWithProviders(<ClassForm />);
    const user = userEvent.setup();
    await fill(user);

    await user.click(screen.getByRole("combobox", { name: "Disciplina" }));
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "Sem disciplina",
      POO_SUBJECT.name,
    ]);
    await user.click(screen.getByRole("option", { name: POO_SUBJECT.name }));
    await user.type(screen.getByLabelText(/^Período/), "2026.1");
    await user.type(screen.getByLabelText(/^Data de início/), "2026-02-02");
    await user.type(screen.getByLabelText(/^Data de término/), "2026-06-30");
    await user.click(screen.getByRole("button", { name: "Criar turma" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(subjectCalls).toEqual(["/api/subjects?status=ACTIVE"]);
    expect(sentBody(0, fetchMock)).toMatchObject({
      subjectId: POO_SUBJECT.id,
      period: "2026.1",
      startsOn: "2026-02-02",
      endsOn: "2026-06-30",
    });
    await expectNoA11yViolations(container);
  });

  it("vem com a disciplina escolhida pela página da disciplina (?disciplina=)", async () => {
    stubFetch(fetchMock);
    renderWithProviders(<ClassForm defaultSubjectId={POO_SUBJECT.id} />);
    const select = screen.getByRole("combobox", { name: "Disciplina" });
    await vi.waitFor(() => expect(select.textContent).toBe(POO_SUBJECT.name));
  });

  it("edita turma com disciplina desativada: ela continua como opção e é mantida", async () => {
    stubFetch(fetchMock, []);
    fetchMock.mockResolvedValueOnce(json(200, CLASS));
    const offering: ClassView = {
      ...CLASS,
      subject: POO_SUBJECT,
      startsOn: "2027-02-01",
      endsOn: "2027-06-30",
      plannable: true,
    };
    renderWithProviders(<ClassForm initial={offering} />);
    const user = userEvent.setup();

    expect((screen.getByLabelText(/^Data de início/) as HTMLInputElement).value).toBe("2027-02-01");
    await vi.waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Disciplina" }).textContent).toBe(`${POO_SUBJECT.name} (inativa)`),
    );
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(sentBody(0, fetchMock)).toMatchObject({
      subjectId: POO_SUBJECT.id,
      startsOn: "2027-02-01",
      endsOn: "2027-06-30",
    });
  });

  it.each([
    ["término antes do início", "2026-06-30", "2026-02-02", /^Data de término/, "A data de término não pode ser anterior à de início."],
    ["só a data de início", "2026-02-02", "", /^Data de término/, "Informe as datas de início e de término, ou deixe as duas em branco."],
    ["só a data de término", "", "2026-06-30", /^Data de início/, "Informe as datas de início e de término, ou deixe as duas em branco."],
  ])("%s: erro junto ao campo, sem chamar a API", async (_case, startsOn, endsOn, field, message) => {
    stubFetch(fetchMock);
    renderWithProviders(<ClassForm />);
    const user = userEvent.setup();
    await fill(user);
    if (startsOn) await user.type(screen.getByLabelText(/^Data de início/), startsOn);
    if (endsOn) await user.type(screen.getByLabelText(/^Data de término/), endsOn);
    await user.click(screen.getByRole("button", { name: "Criar turma" }));

    const input = screen.getByLabelText(field);
    await vi.waitFor(() => expectFieldErrorLinked(input));
    expect(screen.getByRole("group", { name: "Não foi possível criar a turma" }).textContent).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SUBJECT_INACTIVE aparece no campo Disciplina", async () => {
    stubFetch(fetchMock);
    fetchMock.mockResolvedValueOnce(
      apiError(409, "SUBJECT_INACTIVE", "Esta disciplina está desativada. Reative-a para usá-la."),
    );
    renderWithProviders(<ClassForm defaultSubjectId={POO_SUBJECT.id} />);
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Criar turma" }));

    await vi.waitFor(() => expectFieldErrorLinked(screen.getByRole("combobox", { name: "Disciplina" })));
    expect(document.getElementById("disciplina-erro")!.textContent).toBe(
      "Esta disciplina está desativada. Reative-a para usá-la.",
    );
  });
});

describe("003/SC-011 SC-012 — ClassForm só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    stubFetch(fetchMock);
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
      screen.getByRole("combobox", { name: "Disciplina" }),
      screen.getByLabelText(/^Período/),
      screen.getByLabelText(/^Data de início/),
      screen.getByLabelText(/^Data de término/),
      screen.getByLabelText("Descrição"),
      screen.getByRole("button", { name: "Criar turma" }),
      screen.getByRole("link", { name: "Cancelar" }),
    ]);

    await tabTo(user, name);
    await user.keyboard("Redes{Tab}REDES-1{Enter}");
    expect(await screen.findByRole("group", { name: "Não foi possível criar a turma" })).toBe(document.activeElement);
  });
});
