import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type FormEvent, useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y";
import { ErrorSummary, Field, type FormError, SubmitButton } from "./index";

function ExampleForm() {
  const [errors, setErrors] = useState<FormError[]>([]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    setErrors(email ? [] : [{ fieldId: "email", message: "Informe o e-mail." }]);
  };
  const emailError = errors.find((e) => e.fieldId === "email")?.message;

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Exemplo">
      <ErrorSummary errors={errors} />
      <Field id="email" name="email" type="email" label="E-mail" hint="Use seu e-mail institucional." error={emailError} required />
      <SubmitButton>Enviar</SubmitButton>
    </form>
  );
}

describe("form components (FR-075, R22)", () => {
  it("Field associates label, hint and error", () => {
    render(<Field id="nome" name="nome" label="Nome" hint="Como quer ser chamado." error="Informe o nome." />);
    const input = screen.getByLabelText("Nome");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("nome-dica nome-erro");
    expect(document.getElementById("nome-erro")?.textContent).toBe("Informe o nome.");
  });

  it("Field without error is not marked invalid", () => {
    render(<Field id="nome" name="nome" label="Nome" />);
    const input = screen.getByLabelText("Nome");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
  });

  it("keyboard-only: invalid submit focuses the summary, its link focuses the field", async () => {
    const user = userEvent.setup();
    render(<ExampleForm />);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText(/E-mail/));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Enviar" }));
    await user.keyboard("{Enter}");

    const summary = screen.getByRole("group", { name: "Corrija os itens abaixo" });
    expect(document.activeElement).toBe(summary);
    expect(summary.parentElement?.getAttribute("aria-live")).toBe("polite");

    await user.tab();
    const link = screen.getByRole("link", { name: "Informe o e-mail." });
    expect(document.activeElement).toBe(link);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText(/E-mail/));
  });

  it("SubmitButton announces the busy state and stays focusable", () => {
    render(
      <form>
        <SubmitButton pending pendingLabel="Entrando…">
          Entrar
        </SubmitButton>
      </form>,
    );
    const button = screen.getByRole("button", { name: "Entrando…" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("Entrando…");
  });

  it("has no axe violations, with and without errors", async () => {
    const user = userEvent.setup();
    const { container } = render(<ExampleForm />);
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await expectNoA11yViolations(container);
  });
});
