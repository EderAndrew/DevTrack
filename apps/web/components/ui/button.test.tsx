import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y";
import { Button, buttonVariants } from "./button";

// 005 US2 (FR-014, FR-020; contracts/components.md "Button").

const VARIANTS = ["primary", "secondary", "outline", "ghost", "danger", "link"] as const;
const SIZES = ["sm", "md", "icon"] as const;

describe("005/US2-1 botão com variantes, tamanhos e estados", () => {
  it.each(VARIANTS)("variante %s marca data-variant e tem classes próprias", (variant) => {
    render(<Button variant={variant}>Salvar</Button>);
    const button = screen.getByRole("button", { name: "Salvar" });
    expect(button.getAttribute("data-variant")).toBe(variant);
    for (const other of VARIANTS.filter((name) => name !== variant)) {
      expect(buttonVariants({ variant }), `${variant} × ${other}`).not.toBe(buttonVariants({ variant: other }));
    }
  });

  it("primary é o padrão e default é alias de primary", () => {
    render(
      <>
        <Button>Sem variante</Button>
        <Button variant="default">Alias</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Sem variante" }).getAttribute("data-variant")).toBe("primary");
    expect(screen.getByRole("button", { name: "Alias" }).getAttribute("data-variant")).toBe("primary");
    expect(buttonVariants({ variant: "default" })).toBe(buttonVariants({ variant: "primary" }));
  });

  it("destructive é alias de danger", () => {
    render(<Button variant="destructive">Excluir turma</Button>);
    expect(screen.getByRole("button", { name: "Excluir turma" }).getAttribute("data-variant")).toBe("danger");
    expect(buttonVariants({ variant: "destructive" })).toBe(buttonVariants({ variant: "danger" }));
  });

  it.each(SIZES)("tamanho %s", (size) => {
    render(
      <Button size={size} aria-label={size === "icon" ? "Fechar" : undefined}>
        {size === "icon" ? null : "Ok"}
      </Button>,
    );
    expect(screen.getByRole("button").getAttribute("data-size")).toBe(size);
  });

  it("md é o tamanho padrão, com 44 px de altura (min-h-11), e default é alias de md", () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole("button").getAttribute("data-size")).toBe("md");
    expect(buttonVariants({ size: "md" })).toContain("min-h-11");
    expect(buttonVariants({ size: "default" })).toBe(buttonVariants({ size: "md" }));
    expect(buttonVariants({ size: "icon" })).toContain("size-11");
  });

  it("carregando: aria-busy, desabilitado, rótulo mantido e spinner oculto", () => {
    render(<Button loading>Enviar</Button>);
    const button = screen.getByRole("button", { name: "Enviar" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    const spinner = button.querySelector("svg");
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(spinner?.getAttribute("class")).toContain("motion-safe:animate-spin");
  });

  it("carregando: um clique não dispara de novo a ação", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Enviar</Button>);
    await user.click(screen.getByRole("button"));
    rerender(
      <Button loading onClick={onClick}>
        Enviar
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("desabilitado usa os tokens --disabled-*", () => {
    render(<Button disabled>Salvar</Button>);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(buttonVariants({})).toMatch(/disabled:bg-disabled-bg/);
    expect(buttonVariants({})).toMatch(/disabled:text-disabled-fg/);
  });

  it("sem violações de acessibilidade em todas as variantes", async () => {
    const { container } = render(
      <div>
        {VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
        <Button loading>Carregando</Button>
        <Button size="icon" aria-label="Fechar" />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});

describe("005/US2-2 ação destrutiva nunca parece uma ação comum", () => {
  it("danger usa as cores de perigo e difere de primary, com texto explícito", () => {
    render(<Button variant="danger">Remover aluno</Button>);
    expect(screen.getByRole("button", { name: "Remover aluno" }).textContent).toBe("Remover aluno");
    const danger = buttonVariants({ variant: "danger" });
    expect(danger).toMatch(/\b(bg|border|text)-danger/);
    expect(danger).not.toMatch(/\bbg-primary\b/);
    expect(buttonVariants({ variant: "primary" })).not.toMatch(/danger/);
  });
});
