import type { WorkStudentView, WorkTeacherView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import {
  apiError,
  itemId,
  json,
  POO_REVISION,
  workApiMock,
  workView,
} from "./test-fixtures";
import { VERSION_CONFLICT_NOTICE, WorkDetail } from "./work-detail";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const WORK_ID = "00000000-0000-4000-e000-000000000001";
const KOTLIN = { id: "00000000-0000-4000-a000-000000000099", name: "Kotlin", highlight: null };

/** A generated DRAFT, edited by the teacher: an open answer, a trick question and code without test cases in a language deactivated since. */
const generated: WorkTeacherView = workView({
  id: WORK_ID,
  syllabusRevisionId: POO_REVISION.id,
  topics: [
    {
      syllabusItemId: itemId("Herança"),
      itemText: "Herança",
      groupTitle: "Orientação a objetos",
    },
  ],
  title: "Trabalho de herança",
  difficulty: "INTERMEDIATE",
  totalGrade: "3.00",
  questionCount: 3,
  origin: "AI_GENERATED",
  status: "DRAFT",
  version: 3,
  humanReviewed: false,
  humanEdited: true,
  reviewedBy: null,
  reviewedAt: null,
  generationRequestId: "00000000-0000-4000-f000-000000000001",
  warnings: [{ code: "CODE_QUESTION_WITHOUT_TEST_CASES", positions: [2] }],
  questions: [
    {
      id: "00000000-0000-4000-8000-000000000011",
      position: 0,
      type: "OPEN_ANSWER",
      gradingStrategy: "AI_REVIEW",
      value: "1.00",
      statement: "O que é herança?",
      explanation: "Reuso.",
      topicItemIds: [itemId("Herança")],
      expectedAnswer: "Reuso de comportamento.",
      rubric: null,
      isTrickQuestion: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000012",
      position: 1,
      type: "MULTIPLE_CHOICE",
      gradingStrategy: "EXACT_MATCH",
      value: "1.00",
      statement: "Qual palavra-chave declara herança?",
      explanation: null,
      topicItemIds: [],
      alternatives: [
        {
          id: "00000000-0000-4000-8000-000000000021",
          position: 0,
          text: "implements",
          isCorrect: false,
        },
        {
          id: "00000000-0000-4000-8000-000000000022",
          position: 1,
          text: "extends",
          isCorrect: true,
        },
        {
          id: "00000000-0000-4000-8000-000000000023",
          position: 2,
          text: "inherits",
          isCorrect: false,
        },
      ],
      isTrickQuestion: true,
    },
    {
      id: "00000000-0000-4000-8000-000000000013",
      position: 2,
      type: "CODE",
      gradingStrategy: "TEST_CASES",
      value: "1.00",
      statement: "Implemente Cachorro.",
      explanation: null,
      topicItemIds: [],
      instructions: null,
      starterCode: null,
      expectedSolution: "class Cachorro {}",
      language: KOTLIN,
      testCases: [],
      isTrickQuestion: false,
    },
  ],
});

const PREVIEW: WorkStudentView = {
  id: WORK_ID,
  title: "Trabalho de herança",
  description: null,
  totalGrade: "3.00",
  questions: [
    {
      id: "00000000-0000-4000-8000-000000000011",
      position: 0,
      type: "OPEN_ANSWER",
      value: "1.00",
      statement: "O que é herança?",
    },
  ],
};

describe("011/US5 WorkDetail — revisar, editar e aprovar o trabalho", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { method: string; url: string; body: unknown }[] = [];
  let current: WorkTeacherView;
  let answerWrite: (url: string, body: Record<string, unknown>) => Response;

  beforeEach(() => {
    writes.length = 0;
    current = generated;
    answerWrite = (url, body) => {
      if (url.endsWith("/archive"))
        current = {
          ...current,
          status: "ARCHIVED",
          archivedFromStatus: current.status,
          version: current.version + 1,
        };
      else if (url.endsWith("/restore"))
        current = {
          ...current,
          status: current.archivedFromStatus!,
          archivedFromStatus: null,
          version: current.version + 1,
        };
      else
        current = url.endsWith("/approve")
          ? {
              ...current,
              status: "APPROVED",
              humanReviewed: true,
              reviewedBy: { name: "Professora Ana" },
              reviewedAt: "2026-09-30T15:00:00.000Z",
              version: current.version + 1,
            }
          : {
              ...current,
              title: String(body.title),
              version: current.version + 1,
            };
      return json(200, current);
    };
    const reads = workApiMock(() => apiError(500, "INTERNAL", "x"));
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
        writes.push({ method, url, body });
        return answerWrite(url, body);
      }
      if (url === `/api/works/${WORK_ID}`) return json(200, current);
      if (url === `/api/works/${WORK_ID}/student-preview`)
        return json(200, PREVIEW);
      return reads(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const render = (
    props: Partial<{
      canEdit: boolean;
      canApprove: boolean;
      canArchive: boolean;
    }> = {},
  ) =>
    renderWithProviders(
      <WorkDetail workId={WORK_ID} canEdit canApprove canArchive {...props} />,
    );
  const question = (n: number) =>
    screen.getByRole("group", { name: `Questão ${n}` });

  it("mostra a situação, a origem e a edição por pessoa em palavras, a pegadinha com texto e ícone; sem violações de acessibilidade", async () => {
    const { container } = render();
    expect(await screen.findByDisplayValue("Trabalho de herança")).toBeTruthy();
    expect(screen.getByText("Rascunho")).toBeTruthy();
    expect(screen.getByText("Gerado por IA")).toBeTruthy();
    expect(screen.getByText("Editado por você")).toBeTruthy();
    expect(
      within(question(2)).getByText("Pegadinha", { selector: "span, div" }),
    ).toBeTruthy();
    expect(
      within(question(1)).queryByText("Pegadinha", { selector: "span, div" }),
    ).toBeNull();
    // A saved question keeps its type; the subject never changes.
    expect(
      within(question(2)).getByText("Tipo: Múltipla escolha"),
    ).toBeTruthy();
    expect(
      within(question(2)).queryByRole("combobox", { name: /^Tipo/ }),
    ).toBeNull();
    expect(
      screen.getByText(`Disciplina: ${generated.subject.name}`),
    ).toBeTruthy();
    await screen.findByRole("checkbox", { name: "Herança" });
    await expectNoA11yViolations(container);
  });

  it("011/FR-007 a linguagem desativada depois continua na questão, sem precisar trocar", async () => {
    render();
    const select = await within(
      await screen.findByRole("group", { name: "Questão 3" }),
    ).findByRole("combobox", { name: /^Linguagem/ });
    expect((select as HTMLSelectElement).value).toBe(KOTLIN.id);
    expect(
      within(select).getByRole("option", { name: "Kotlin (desativada)" }),
    ).toBeTruthy();
  });

  it("011/US5-2 salvar envia o trabalho inteiro com os ids das questões e a versão lida", async () => {
    render();
    const user = userEvent.setup();
    const title = await screen.findByDisplayValue("Trabalho de herança");
    await user.clear(title);
    await user.type(title, "Trabalho revisto");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Alterações salvas.")).toBeTruthy();
    expect(writes).toHaveLength(1);
    const [write] = writes;
    expect(write).toMatchObject({
      method: "PUT",
      url: `/api/works/${WORK_ID}`,
    });
    expect(write!.body).toMatchObject({
      title: "Trabalho revisto",
      totalGrade: "3.00",
      difficulty: "INTERMEDIATE",
      topics: {
        syllabusRevisionId: POO_REVISION.id,
        syllabusItemIds: [itemId("Herança")],
      },
      version: 3,
      questions: [
        {
          id: generated.questions[0]!.id,
          type: "OPEN_ANSWER",
          topicItemIds: [itemId("Herança")],
        },
        {
          id: generated.questions[1]!.id,
          type: "MULTIPLE_CHOICE",
          isTrickQuestion: true,
          alternatives: [
            { text: "implements", isCorrect: false },
            { text: "extends", isCorrect: true },
            { text: "inherits", isCorrect: false },
          ],
        },
        {
          id: generated.questions[2]!.id,
          type: "CODE",
          languageId: KOTLIN.id,
          testCases: [],
        },
      ],
    });
    expect(await screen.findByDisplayValue("Trabalho revisto")).toBeTruthy();
  });

  it("011/US5-1 aprovar pede confirmação que lista os avisos e envia a versão lida", async () => {
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Aprovar" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Aprovar este trabalho?",
    });
    expect(
      within(dialog).getByText(/A questão 3 é de código sem casos de teste/),
    ).toBeTruthy();
    expect(writes).toEqual([]);
    await user.click(
      within(dialog).getByRole("button", { name: "Aprovar trabalho" }),
    );
    expect(await screen.findByText("Trabalho aprovado.")).toBeTruthy();
    expect(writes).toEqual([
      {
        method: "POST",
        url: `/api/works/${WORK_ID}/approve`,
        body: { version: 3 },
      },
    ]);
    expect(await screen.findByText("Aprovado")).toBeTruthy();
    expect(screen.getByText(/Revisado por Professora Ana/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
  });

  it("011/US5-6 conflito de versão mostra o aviso e recarrega o trabalho como está agora", async () => {
    answerWrite = () => {
      current = { ...current, title: "Mudado na outra aba", version: 4 };
      return apiError(409, "WORK_VERSION_CONFLICT", "conflito");
    };
    render();
    const user = userEvent.setup();
    const title = await screen.findByDisplayValue("Trabalho de herança");
    await user.clear(title);
    await user.type(title, "Minha edição");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText(VERSION_CONFLICT_NOTICE)).toBeTruthy();
    expect(await screen.findByDisplayValue("Mudado na outra aba")).toBeTruthy();
  });

  it("uma edição recusada pelo servidor aparece no resumo de erros e o formulário continua como estava", async () => {
    answerWrite = () => apiError(400, "VALIDATION_ERROR", "inválido");
    render();
    const user = userEvent.setup();
    await screen.findByDisplayValue("Trabalho de herança");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(
      await screen.findByText("Não foi possível salvar o trabalho"),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("Trabalho de herança")).toBeTruthy();
  });

  it("011/FR-016 trabalho arquivado: tudo à vista, nada editável, sem salvar nem aprovar", async () => {
    current = { ...generated, status: "ARCHIVED", archivedFromStatus: "DRAFT" };
    render();
    expect(
      await screen.findByText(
        /Trabalho arquivado: não pode ser editado nem aprovado\. Ao restaurar, volta a rascunho\./,
      ),
    ).toBeTruthy();
    // A disabled fieldset turns its controls off: `:disabled`, not the element's own attribute.
    expect(
      screen.getByDisplayValue("Trabalho de herança").matches(":disabled"),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Salvar alterações" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
  });

  it("sem trabalhos.aprovar não há Aprovar; sem trabalhos.editar não há Salvar; sem trabalhos.arquivar não há Arquivar", async () => {
    render({ canApprove: false, canEdit: false, canArchive: false });
    await screen.findByDisplayValue("Trabalho de herança");
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Salvar alterações" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Arquivar" })).toBeNull();
  });

  it("011/US7-3 arquivar pede confirmação, envia a versão lida e passa a oferecer só restaurar, de volta a rascunho", async () => {
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Arquivar" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Arquivar este trabalho?",
    });
    expect(writes).toEqual([]);
    await user.click(
      within(dialog).getByRole("button", { name: "Arquivar trabalho" }),
    );
    expect(await screen.findByText("Trabalho arquivado.")).toBeTruthy();
    expect(writes).toEqual([
      {
        method: "POST",
        url: `/api/works/${WORK_ID}/archive`,
        body: { version: 3 },
      },
    ]);
    expect(
      await screen.findByText(/Ao restaurar, volta a rascunho/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Arquivar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(await screen.findByText("Trabalho restaurado.")).toBeTruthy();
    expect(writes.at(-1)).toEqual({
      method: "POST",
      url: `/api/works/${WORK_ID}/restore`,
      body: { version: 4 },
    });
    expect(
      await screen.findByRole("button", { name: "Arquivar" }),
    ).toBeTruthy();
    expect(screen.getByText("Rascunho")).toBeTruthy();
  });

  it("arquivar com a versão antiga mostra o aviso de outra aba e o trabalho atual", async () => {
    answerWrite = () => {
      current = { ...current, title: "Mudado na outra aba", version: 4 };
      return apiError(409, "WORK_VERSION_CONFLICT", "conflito");
    };
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Arquivar" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Arquivar trabalho",
      }),
    );
    expect(await screen.findByText(VERSION_CONFLICT_NOTICE)).toBeTruthy();
    expect(await screen.findByDisplayValue("Mudado na outra aba")).toBeTruthy();
  });

  it('011/US6 "Ver como aluno" mostra a visão do servidor, somente leitura', async () => {
    render();
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", {
      name: "Ver como aluno",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(
      await screen.findByText("Visão do aluno (somente leitura)"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Ocultar visão do aluno" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("011/SC-012 Aprovar, Ver como aluno, o formulário e Salvar alterações pelo teclado, nessa ordem", async () => {
    render();
    const user = userEvent.setup();
    const approve = await screen.findByRole("button", { name: "Aprovar" });
    await screen.findByRole("checkbox", { name: "Herança" });
    await expectTabOrder(user, [
      approve,
      screen.getByRole("button", { name: "Ver como aluno" }),
      screen.getByLabelText(/^Título/),
      screen.getByRole("button", { name: "Salvar alterações" }),
    ]);
  });
});
