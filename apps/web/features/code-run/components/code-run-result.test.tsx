import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { COMPILATION_ERROR, RUN_FAILED, STALE_RESULT, VERDICT_LABELS } from "../schemas/code-run";
import { CodeRunResult } from "./code-run-result";
import { codeRun, PUBLIC_CASES, SOURCE } from "./test-fixtures";

const show = (run = codeRun(), sourceCode = SOURCE) => renderWithProviders(<CodeRunResult run={run} publicTestCases={PUBLIC_CASES} sourceCode={sourceCode} />);
const caseItems = () => within(screen.getByRole("list", { name: "Casos públicos" })).getAllByRole("listitem");
const trigger = (index: number) => within(caseItems()[index]!).getByRole("button");

describe("019/US1 resultado de uma execução", () => {
  it("019/US1-2 019/SC-008 todos passaram: o resumo e cada caso com entrada, esperada, obtida e tempo; axe", async () => {
    const { container } = show();
    expect(screen.getByText("2 de 2 casos públicos passaram")).toBeTruthy();
    expect(caseItems()).toHaveLength(2);
    expect(trigger(0).textContent).toContain("Caso 1");
    expect(trigger(0).textContent).toContain("Passou");
    // Nothing failed: every case starts closed, opened by its button.
    expect(trigger(0).getAttribute("aria-expanded")).toBe("false");
    await userEvent.setup().click(trigger(1));
    expect(trigger(1).getAttribute("aria-expanded")).toBe("true");
    const opened = caseItems()[1]!;
    for (const label of ["Entrada", "Saída esperada", "Saída obtida"]) expect(within(opened).getByText(label)).toBeTruthy();
    expect(opened.textContent).toContain("3");
    expect(opened.textContent).toContain("6");
    expect(within(opened).getByText("Tempo: 95 ms")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("019/US1-3 saída diferente: o primeiro caso que falhou abre sozinho, com a esperada e a obtida", () => {
    show(codeRun({ passedCount: 1, cases: [codeRun().cases[0]!, { position: 1, verdict: "WRONG_OUTPUT", stdout: "7\n", stderr: "", durationMs: 80 }] }));
    expect(screen.getByText("1 de 2 casos públicos passaram")).toBeTruthy();
    expect(trigger(0).getAttribute("aria-expanded")).toBe("false");
    expect(trigger(1).getAttribute("aria-expanded")).toBe("true");
    expect(trigger(1).textContent).toContain("Saída diferente");
    const failed = caseItems()[1]!;
    expect(failed.textContent).toContain("6");
    expect(failed.textContent).toContain("7");
  });

  it("019/US1-4 erro de compilação: o título e a mensagem, sem casos", () => {
    show(codeRun({ outcome: "COMPILATION_ERROR", passedCount: 0, cases: [], compileOutput: "Main.java:1: error: ';' expected" }));
    expect(screen.getByText(COMPILATION_ERROR)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Resultado da execução" }).textContent).toContain("';' expected");
    expect(screen.queryByRole("list", { name: "Casos públicos" })).toBeNull();
  });

  it("019/US1-5 erro de execução: a saída obtida até ali e a saída de erro", () => {
    show(codeRun({ passedCount: 0, cases: [{ position: 0, verdict: "RUNTIME_ERROR", stdout: "antes\n", stderr: "ZeroDivisionError", durationMs: 70 }], publicCaseCount: 1 }));
    expect(screen.getByText("0 de 1 caso público passou")).toBeTruthy();
    const opened = caseItems()[0]!;
    expect(within(opened).getByText("Saída de erro")).toBeTruthy();
    expect(opened.textContent).toContain("ZeroDivisionError");
    expect(opened.textContent).toContain("antes");
  });

  it("019/US1-6 019/SC-008 cada veredito dito em palavras, com ícone (nunca só cor)", () => {
    const verdicts = Object.keys(VERDICT_LABELS) as (keyof typeof VERDICT_LABELS)[];
    show(
      codeRun({
        publicCaseCount: 6,
        passedCount: 1,
        cases: verdicts.map((verdict, position) => ({ position, verdict, stdout: "", stderr: "", durationMs: 10 })),
      }),
    );
    verdicts.forEach((verdict, index) => {
      expect(trigger(index).textContent).toContain(VERDICT_LABELS[verdict]);
      expect(trigger(index).querySelector("svg[aria-hidden='true']")).not.toBeNull();
    });
    expect(Object.values(VERDICT_LABELS)).toEqual(["Passou", "Saída diferente", "Erro de execução", "Tempo esgotado", "Memória excedida", "Saída grande demais"]);
  });

  it("019/US1-10 o código no editor mudou: o resultado é de uma versão anterior", () => {
    show(codeRun(), `${SOURCE}# mudou\n`);
    expect(screen.getByText(STALE_RESULT)).toBeTruthy();
  });

  it("019/FR-017 execução que falhou: \"Não foi possível executar agora\"; conteúdo apagado: nada", () => {
    const failed = show(codeRun({ status: "FAILED", failureReason: "EXPIRED", outcome: null, passedCount: null, cases: [] }));
    expect(screen.getByText(RUN_FAILED)).toBeTruthy();
    failed.unmount();
    const purged = show(codeRun({ contentPurged: true, sourceCode: null, cases: [] }));
    expect(purged.container.textContent).toBe("");
  });

  it("019/FR-021 saída, saída de erro e mensagem do compilador com HTML aparecem como texto", () => {
    const html = "<img src=x onerror=alert(1)><b>negrito</b>";
    const { container, unmount } = show(codeRun({ passedCount: 0, cases: [{ position: 0, verdict: "RUNTIME_ERROR", stdout: html, stderr: html, durationMs: 1 }], publicCaseCount: 1 }));
    expect(container.querySelector("img, b")).toBeNull();
    expect(container.textContent).toContain("<b>negrito</b>");
    unmount();
    const compiled = show(codeRun({ outcome: "COMPILATION_ERROR", passedCount: 0, cases: [], compileOutput: html }));
    expect(compiled.container.querySelector("img, b")).toBeNull();
    expect(compiled.container.textContent).toContain("<b>negrito</b>");
  });
});
