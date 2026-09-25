import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../test/keyboard";
import { Checkbox } from "./checkbox";
import { FieldMessage } from "./field-message";
import { FormField } from "./form-field";
import { Input } from "./input";
import { Label } from "./label";
import { NativeSelect } from "./native-select";
import { Radio, RadioGroup } from "./radio";
import { Switch } from "./switch";
import { Textarea } from "./textarea";

// 005 US2 (FR-015; contracts/components.md "Formulários"; research V10).

const classOf = (element: Element) => element.getAttribute("class") ?? "";

describe("005/US2-3 componentes de formulário e seus estados", () => {
  it("Input e Textarea: borda --border-control, fundo --surface, erro e sucesso", () => {
    render(
      <>
        <Input aria-label="Nome" />
        <Textarea aria-label="Observação" />
      </>,
    );
    for (const field of [screen.getByLabelText("Nome"), screen.getByLabelText("Observação")]) {
      expect(classOf(field)).toMatch(/\bborder-border-control\b/);
      expect(classOf(field)).toMatch(/\bbg-surface\b/);
      expect(classOf(field)).toMatch(/aria-invalid:border-danger/);
      expect(classOf(field)).toMatch(/data-\[state=success\]:border-success/);
      expect(classOf(field)).toMatch(/disabled:bg-disabled-bg/);
    }
    expect(classOf(screen.getByLabelText("Nome"))).toMatch(/\bmin-h-11\b/);
  });

  it("NativeSelect é um <select> nativo com ícone oculto, e selectOptions funciona", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Label htmlFor="turma">Turma</Label>
        <NativeSelect id="turma" defaultValue="a">
          <option value="a">Turma A</option>
          <option value="b">Turma B</option>
        </NativeSelect>
      </>,
    );
    const select = screen.getByLabelText("Turma") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(classOf(select)).toMatch(/\bborder-border-control\b/);
    expect(select.parentElement?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    await user.selectOptions(select, "b");
    expect(select.value).toBe("b");
  });

  it("Checkbox é um <input type=checkbox> nativo de 20 px com accent-color primário", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Checkbox id="aceite" />
        <Label htmlFor="aceite">Aceito os termos</Label>
      </>,
    );
    const box = screen.getByLabelText("Aceito os termos") as HTMLInputElement;
    expect(box.type).toBe("checkbox");
    expect(classOf(box)).toMatch(/\bsize-5\b/);
    expect(classOf(box)).toMatch(/\baccent-primary\b/);
    await user.click(screen.getByText("Aceito os termos"));
    expect(box.checked).toBe(true);
  });

  it("Radio em RadioGroup: fieldset com legend e escolha exclusiva", async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup legend="Ação">
        <div>
          <Radio id="mover" name="acao" value="MOVE" />
          <Label htmlFor="mover">Mover</Label>
        </div>
        <div>
          <Radio id="arquivar" name="acao" value="ARCHIVE" />
          <Label htmlFor="arquivar">Arquivar</Label>
        </div>
      </RadioGroup>,
    );
    const group = screen.getByRole("group", { name: "Ação" });
    expect(group.tagName).toBe("FIELDSET");
    const move = screen.getByLabelText("Mover") as HTMLInputElement;
    const archive = screen.getByLabelText("Arquivar") as HTMLInputElement;
    expect(move.type).toBe("radio");
    await user.click(move);
    await user.click(archive);
    expect([move.checked, archive.checked]).toEqual([false, true]);
  });

  it('Switch tem role="switch", rótulo e alterna com o teclado', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Switch id="avisos" />
        <Label htmlFor="avisos">Receber avisos</Label>
      </>,
    );
    const toggle = screen.getByRole("switch", { name: "Receber avisos" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    toggle.focus();
    await user.keyboard(" ");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("Label usa text-label e marca obrigatório com texto", () => {
    render(
      <Label htmlFor="x" required>
        E-mail
      </Label>,
    );
    const label = screen.getByText(/E-mail/);
    expect(classOf(label)).toMatch(/\btext-label\b/);
    expect(label.textContent).toBe("E-mail (obrigatório)");
  });

  it("FieldMessage: descrição em --text-secondary, erro com ícone e texto em --danger-text", () => {
    render(
      <>
        <FieldMessage id="d">Use o e-mail institucional.</FieldMessage>
        <FieldMessage id="e" tone="error">
          Informe o e-mail.
        </FieldMessage>
        <FieldMessage id="s" tone="success">
          E-mail disponível.
        </FieldMessage>
      </>,
    );
    expect(classOf(document.getElementById("d")!)).toMatch(/\btext-text-secondary\b/);
    const error = document.getElementById("e")!;
    expect(error.textContent).toBe("Informe o e-mail.");
    expect(classOf(error)).toMatch(/\btext-danger-text\b/);
    expect(error.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.getElementById("s")!.querySelector("svg")).not.toBeNull();
  });

  it("FormField liga rótulo, descrição e erro por aria-describedby e aria-invalid", () => {
    render(
      <FormField id="email" label="E-mail" description="Use o e-mail institucional." error="Informe o e-mail." required>
        {(control) => <Input type="email" {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText(/E-mail/);
    expect(input.getAttribute("aria-describedby")).toBe("email-dica email-erro");
    expect(input.getAttribute("required")).not.toBeNull();
    expectFieldErrorLinked(input);
    expect(document.getElementById("email-erro")?.querySelector("svg")).not.toBeNull();
  });

  it('FormField com sucesso marca data-state="success" e não marca erro', () => {
    render(
      <FormField id="ra" label="RA" success="RA confirmado.">
        {(control) => <Input {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText("RA");
    expect(input.getAttribute("data-state")).toBe("success");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.getAttribute("aria-describedby")).toBe("ra-sucesso");
  });

  it("FormField sem descrição nem mensagem não cria aria-describedby", () => {
    render(
      <FormField id="n" label="Nome">
        {(control) => <Input {...control} />}
      </FormField>,
    );
    expect(screen.getByLabelText("Nome").hasAttribute("aria-describedby")).toBe(false);
  });

  it("desabilitados não recebem foco nem mudam", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Checkbox id="c" disabled aria-label="Caixa" />
        <Radio id="r" disabled aria-label="Opção" />
        <NativeSelect disabled aria-label="Lista">
          <option>A</option>
        </NativeSelect>
        <Switch disabled aria-label="Interruptor" />
      </>,
    );
    await user.click(screen.getByLabelText("Caixa"));
    expect((screen.getByLabelText("Caixa") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("switch") as HTMLButtonElement).disabled).toBe(true);
    await user.tab();
    expect(document.activeElement).toBe(document.body);
  });

  it("ordem de tabulação e axe", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <form aria-label="Exemplo">
        <FormField id="nome" label="Nome" error="Informe o nome.">
          {(control) => <Input {...control} />}
        </FormField>
        <FormField id="obs" label="Observação" description="Opcional.">
          {(control) => <Textarea {...control} />}
        </FormField>
        <FormField id="turma" label="Turma">
          {(control) => (
            <NativeSelect {...control}>
              <option>A</option>
            </NativeSelect>
          )}
        </FormField>
        <Checkbox id="c" />
        <Label htmlFor="c">Caixa</Label>
        <RadioGroup legend="Opções">
          <Radio id="r1" name="r" />
          <Label htmlFor="r1">Um</Label>
        </RadioGroup>
        <Switch id="s" />
        <Label htmlFor="s">Interruptor</Label>
      </form>,
    );
    await expectTabOrder(user, [
      screen.getByLabelText("Nome"),
      screen.getByLabelText("Observação"),
      screen.getByLabelText("Turma"),
      screen.getByLabelText("Caixa"),
      screen.getByLabelText("Um"),
      screen.getByRole("switch"),
    ]);
    await expectNoA11yViolations(container);
  });
});
