import type { AttemptCodeRunQuestion } from "@repo/contracts";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { apiError, json } from "@/features/student-activities/components/test-fixtures";
import { formatLongDateTime } from "@/lib/messages/dates";
import { RUN_SUMMARY_NOTE } from "../schemas/code-run-summary";
import { CodeRunSummary } from "./code-run-summary";
import { ACTIVITY_ID, ATTEMPT_ID, CLASS_ID, lastFinished, OTHER_QUESTION_ID, QUESTION_ID, summaryQuestion } from "./test-fixtures";

const SUMMARY = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}/attempts/${ATTEMPT_ID}/code-runs`;

function setup(questions: AttemptCodeRunQuestion[] | Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input) !== SUMMARY) return apiError(404, "NOT_FOUND", "x");
      return questions instanceof Response ? questions.clone() : json(200, { questions });
    }),
  );
  return renderWithProviders(<CodeRunSummary classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} questionId={QUESTION_ID} position={0} />);
}

/** The question's region once loaded (it shows a skeleton while the summary is read). */
const region = async () => {
  const section = await screen.findByRole("region", { name: "Execuções do aluno na questão 1" });
  await waitFor(() => expect(section.querySelector("[aria-busy]")).toBeNull());
  return section;
};

describe("021/US3 resumo das execuções do aluno na correção", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("021/US3-1 n execuções, \"Última execução: p de m casos públicos passaram\", o momento e cada caso em palavras", async () => {
    const { container } = setup([summaryQuestion({ questionId: OTHER_QUESTION_ID, runCount: 9 }), summaryQuestion()]);
    const section = await region();
    expect(within(section).getByRole("heading", { level: 4, name: "Execuções do aluno" })).toBeTruthy();
    expect(within(section).getByText("3 execuções")).toBeTruthy();
    expect(within(section).getByText("Última execução: 1 de 2 casos públicos passaram")).toBeTruthy();
    expect(within(section).getByText(formatLongDateTime("2026-10-15T12:00:02.000Z"))).toBeTruthy();
    const cases = within(section).getByRole("list", { name: "Casos públicos da última execução" });
    expect(within(cases).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Caso 1: Passou", "Caso 2: Saída diferente"]);
    // Verdicts carry an icon besides the words, never colour alone.
    expect(cases.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(2);
    expect(within(section).getByText(RUN_SUMMARY_NOTE)).toBeTruthy();
    expect(screen.queryByText("9 execuções")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("021/US3-2 erro de compilação e \"não foi possível executar\", sem mensagem nem casos", async () => {
    setup([summaryQuestion({ runCount: 1, lastFinished: lastFinished({ outcome: "COMPILATION_ERROR", passedCount: 0, cases: [] }) })]);
    const section = await region();
    expect(within(section).getByText("1 execução")).toBeTruthy();
    expect(within(section).getByText("Última execução: erro de compilação")).toBeTruthy();
    expect(within(section).queryByRole("list")).toBeNull();
    cleanup();
    setup([summaryQuestion({ lastFinished: lastFinished({ status: "FAILED", failureReason: "SANDBOX_ERROR", outcome: null, passedCount: null, cases: [] }) })]);
    expect(within(await region()).getByText("Última execução: não foi possível executar")).toBeTruthy();
  });

  it("021/US3-3 nenhuma execução", async () => {
    const { container } = setup([summaryQuestion({ runCount: 0, lastFinished: null })]);
    const section = await region();
    expect(within(section).getByText("Nenhuma execução")).toBeTruthy();
    expect(within(section).queryByText(/Última execução/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("021/US3-4 021/FR-013 nenhum código, entrada ou saída na tela; \"Uma execução em andamento\" com uma pendente", async () => {
    setup([summaryQuestion({ pending: true })]);
    const section = await region();
    expect(within(section).getByText("Uma execução em andamento")).toBeTruthy();
    expect(section.querySelector("pre, code, textarea")).toBeNull();
    expect(section.textContent).not.toMatch(/Entrada|Saída esperada|Saída obtida|stderr/);
  });

  it("falha ao carregar: a mensagem do catálogo", async () => {
    setup(apiError(500, "INTERNAL_ERROR", "x"));
    expect(within(await region()).getByRole("alert")).toBeTruthy();
  });
});

