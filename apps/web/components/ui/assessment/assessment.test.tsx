import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { CodeAnswer, EssayAnswer, MultipleChoiceAnswer } from "./answers";
import { AssessmentFooter } from "./assessment-footer";
import { CodeEditor } from "./code-editor";
import { QuestionHeader, QuestionStatement, QuestionStatus } from "./question";
import { ExamProgress, QuestionNavigator } from "./question-navigator";
import { AttemptStatus, SaveStatus } from "./save-status";

// 012 research P21 (design-system/exam-mode.md): the NORMAL-mode subset of the Exam Mode
// components — states, announcements, axe and keyboard.

const QUESTIONS = [
  { id: "q1", answered: true },
  { id: "q2", answered: false },
  { id: "q3", answered: true },
];

function Navigator({ onSelect = () => undefined }: { onSelect?: (index: number) => void }) {
  const [current, setCurrent] = useState(1);
  return (
    <QuestionNavigator
      questions={QUESTIONS}
      currentIndex={current}
      onSelect={(index) => {
        setCurrent(index);
        onSelect(index);
      }}
    />
  );
}

describe("012/FR-022 ExamProgress e QuestionNavigator", () => {
  it("\"Questão N de M\" e a barra com N de M respondidas", () => {
    render(<ExamProgress current={2} total={3} answered={2} />);
    expect(screen.getByText("Questão 2 de 3")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "Questões respondidas" });
    expect(bar.getAttribute("aria-valuetext")).toBe("2 de 3 respondidas");
  });

  it("estados atual, respondida e não respondida no nome, na forma e no ícone; aria-current=step", async () => {
    const { container } = render(<Navigator />);
    expect(screen.getByRole("navigation", { name: "Questões" })).toBeTruthy();
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Questão 1, respondida",
      "Questão 2, atual, não respondida",
      "Questão 3, respondida",
    ]);
    expect(buttons[1]!.getAttribute("aria-current")).toBe("step");
    expect(buttons[0]!.getAttribute("aria-current")).toBeNull();
    expect(buttons.map((button) => button.getAttribute("data-state"))).toEqual(["answered", "current", "answered"]);
    // The answered ones carry the check icon: never color alone.
    expect(buttons.map((button) => button.querySelector("svg") !== null)).toEqual([true, false, true]);
    await expectNoA11yViolations(container);
  });

  it("setas, Home e End movem o foco; Enter escolhe a questão", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Navigator onSelect={onSelect} />);
    const buttons = screen.getAllByRole("button");
    buttons[1]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(buttons[2]);
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(buttons[2]);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(buttons[0]);
    await user.keyboard("{End}{ArrowLeft}");
    expect(document.activeElement).toBe(buttons[1]);
    await user.keyboard("{ArrowUp}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(0);
    expect(screen.getAllByRole("button")[0]!.getAttribute("aria-current")).toBe("step");
  });
});

describe("QuestionHeader, QuestionStatus e QuestionStatement", () => {
  it("\"Questão N\" como título, tipo e valor, estado por texto; enunciado como texto", async () => {
    const { container } = render(
      <section>
        <QuestionHeader number={4} typeLabel="Múltipla escolha" valueLabel="Vale 0,17" answered={false} />
        <QuestionStatement>{"Linha 1\n<b>não é HTML</b>"}</QuestionStatement>
      </section>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Questão 4" })).toBeTruthy();
    expect(screen.getByText("Múltipla escolha · Vale 0,17")).toBeTruthy();
    expect(screen.getByText("Não respondida")).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText(/<b>não é HTML<\/b>/)).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("QuestionStatus respondida", () => {
    render(<QuestionStatus answered />);
    expect(screen.getByText("Respondida").getAttribute("data-variant")).toBe("success");
  });
});

describe("012/FR-020 áreas de resposta", () => {
  it("MultipleChoiceAnswer: linha inteira clicável, letra, escolhida com borda e fundo além do rádio", async () => {
    const user = userEvent.setup();
    function Choice() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <MultipleChoiceAnswer
          name="q1"
          alternatives={[
            { id: "a", text: "Primeira" },
            { id: "b", text: "Segunda" },
          ]}
          value={value}
          onChange={setValue}
        />
      );
    }
    const { container } = render(<Choice />);
    expect(screen.getByRole("group", { name: "Alternativas" })).toBeTruthy();
    await user.click(screen.getByText("Segunda"));
    const second = screen.getByRole("radio", { name: /Segunda/ }) as HTMLInputElement;
    expect(second.checked).toBe(true);
    expect(second.closest("label")?.getAttribute("data-state")).toBe("checked");
    expect(second.closest("label")?.className).toContain("bg-primary-subtle");
    expect(screen.getByText("B)")).toBeTruthy();
    await user.keyboard("{ArrowUp}");
    expect((screen.getByRole("radio", { name: /Primeira/ }) as HTMLInputElement).checked).toBe(true);
    await expectNoA11yViolations(container);
  });

  it("EssayAnswer: contador visível e anúncio só a cada 10% restante", async () => {
    function Essay() {
      const [value, setValue] = useState("");
      return <EssayAnswer id="q2" value={value} onChange={setValue} maxLength={100} />;
    }
    const { container } = render(<Essay />);
    const field = screen.getByLabelText("Sua resposta");
    expect(screen.getByText("0 de 100 caracteres")).toBeTruthy();
    const status = screen.getByRole("status");
    fireEvent.change(field, { target: { value: "a".repeat(5) } });
    expect(status.textContent).toBe("Restam 95 caracteres.");
    fireEvent.change(field, { target: { value: "a".repeat(9) } });
    expect(status.textContent).toBe("Restam 95 caracteres.");
    fireEvent.change(field, { target: { value: "a".repeat(11) } });
    expect(status.textContent).toBe("Restam 89 caracteres.");
    expect(screen.getByText("11 de 100 caracteres")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("012/US3-8 CodeAnswer: linguagem, editor com o código inicial e casos públicos, sem saída nem execução", async () => {
    function Code() {
      const [value, setValue] = useState("class Main {}");
      return (
        <CodeAnswer
          id="q3"
          language="Java"
          value={value}
          onChange={setValue}
          publicTestCases={[{ input: "1", expectedOutput: "2" }]}
        />
      );
    }
    const { container } = render(<Code />);
    const editor = screen.getByLabelText("Seu código (Java)") as HTMLTextAreaElement;
    expect(editor.value).toBe("class Main {}");
    expect(screen.getByRole("heading", { name: "Casos de teste públicos" })).toBeTruthy();
    expect(screen.getByText("Saída esperada")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Executar|Erro de execução|testes passaram/);
    await expectNoA11yViolations(container);
  });
});

describe("CodeEditor", () => {
  function Editor() {
    const [value, setValue] = useState("");
    return (
      <>
        <label htmlFor="ed">Código</label>
        <CodeEditor id="ed" value={value} onChange={setValue} />
        <button type="button">depois</button>
      </>
    );
  }

  it("números de linha, Tab indenta, Esc e depois Tab sai do editor (dito na descrição)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Editor />);
    const editor = screen.getByLabelText("Código") as HTMLTextAreaElement;
    expect(editor.getAttribute("aria-describedby")).toContain("ed-ajuda");
    expect(screen.getByText("Tab indenta o código; Esc e depois Tab sai do editor.")).toBeTruthy();
    expect(editor.className).toContain("font-mono");
    await user.click(editor);
    await user.keyboard("a{Tab}b");
    expect(editor.value).toBe("a  b");
    expect(document.activeElement).toBe(editor);
    await user.keyboard("{Enter}c");
    const gutter = container.querySelector('[data-slot="code-editor"] [aria-hidden="true"]');
    expect(gutter?.textContent).toBe("12");
    await user.keyboard("{Escape}{Tab}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "depois" }));
    await expectNoA11yViolations(container);
  });

  it("013/FR-012 somente leitura (gabarito): Tab sai do editor, nada muda e sem a dica de indentação", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <>
        <CodeEditor id="gab" aria-label="Solução de referência" value="class Soma {}" onChange={onChange} readOnly />
        <button type="button">depois</button>
      </>,
    );
    const editor = screen.getByRole("textbox", { name: "Solução de referência" }) as HTMLTextAreaElement;
    expect(editor.readOnly).toBe(true);
    expect(editor.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText("Tab indenta o código; Esc e depois Tab sai do editor.")).toBeNull();
    await user.click(editor);
    await user.keyboard("x{Tab}");
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "depois" }));
    await expectNoA11yViolations(container);
  });
});

describe("012/FR-018 SaveStatus e AttemptStatus", () => {
  afterEach(() => vi.useRealTimers());

  it("\"Salvando…\" só depois de 400 ms; salvo rápido não pisca", () => {
    vi.useFakeTimers();
    const { rerender } = render(<SaveStatus state="idle" />);
    rerender(<SaveStatus state="saving" />);
    expect(screen.queryByText("Salvando…")).toBeNull();
    act(() => vi.advanceTimersByTime(399));
    expect(screen.queryByText("Salvando…")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Salvando…")).toBeTruthy();
    rerender(<SaveStatus state="saved" />);
    expect(screen.queryByText("Salvando…")).toBeNull();
    expect(document.querySelector('[data-slot="save-status"]')?.getAttribute("data-state")).toBe("saved");

    rerender(<SaveStatus state="saving" />);
    act(() => vi.advanceTimersByTime(100));
    rerender(<SaveStatus state="saved" />);
    expect(screen.queryByText("Salvando…")).toBeNull();
  });

  it("\"Resposta salva\" anunciado por role=status no máximo uma vez a cada 10 s", () => {
    vi.useFakeTimers();
    const { rerender } = render(<SaveStatus state="saved" />);
    const status = screen.getByRole("status");
    act(() => vi.advanceTimersByTime(100));
    expect(status.textContent).toBe("Resposta salva");
    // Saved again 5 s later: no new announcement (the region doesn't change).
    act(() => vi.advanceTimersByTime(5_000));
    rerender(<SaveStatus state="saving" />);
    rerender(<SaveStatus state="saved" />);
    act(() => vi.advanceTimersByTime(1));
    expect(status.textContent).toBe("Resposta salva");
    // After 10 s it is emptied and filled again, so it is read again.
    act(() => vi.advanceTimersByTime(10_000));
    rerender(<SaveStatus state="saving" />);
    rerender(<SaveStatus state="saved" />);
    act(() => vi.advanceTimersByTime(1));
    expect(status.textContent).toBe("");
    act(() => vi.advanceTimersByTime(100));
    expect(status.textContent).toBe("Resposta salva");
  });

  it("erro com o texto oficial em role=alert e \"Tentar novamente\"", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(<SaveStatus state="error" onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Não foi possível salvar. Sua resposta continua na tela; tentaremos de novo. Se persistir, avise o professor.",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it("AttemptStatus em palavras", () => {
    render(
      <>
        <AttemptStatus state="IN_PROGRESS" />
        <AttemptStatus state="SUBMITTED_LATE" />
      </>,
    );
    expect(screen.getByText("Em andamento").getAttribute("data-variant")).toBe("info");
    expect(screen.getByText("Entregue com atraso").getAttribute("data-variant")).toBe("warning");
  });
});

describe("AssessmentFooter", () => {
  it("Anterior e Próxima só quando existem; o espaço de entregar fica no fim", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const { rerender, container } = render(
      <AssessmentFooter hasPrevious={false} hasNext onPrevious={vi.fn()} onNext={onNext} submit={<button type="button">Entregar</button>} />,
    );
    expect(screen.queryByRole("button", { name: "Anterior" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(onNext).toHaveBeenCalledOnce();
    rerender(<AssessmentFooter hasPrevious hasNext={false} onPrevious={vi.fn()} onNext={onNext} />);
    expect(screen.getByRole("button", { name: "Anterior" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Próxima" })).toBeNull();
    await expectNoA11yViolations(container);
  });
});
