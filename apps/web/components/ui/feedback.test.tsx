import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { Progress } from "./progress";
import { Skeleton } from "./skeleton";
import { Spinner } from "./spinner";
import { Toaster, type ToastOptions, useToast } from "./toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

// 005 US2 (FR-016; contracts/components.md "Feedback").

const classOf = (element: Element) => element.getAttribute("class") ?? "";

const ALERTS = [
  ["info", "status", "info"],
  ["success", "status", "success"],
  ["warning", "status", "warning"],
  ["danger", "alert", "danger"],
] as const;

describe("005/US2-4 avisos com cor semântica, ícone e título", () => {
  it.each(ALERTS)("Alert %s: role %s, ícone oculto e cores --%s", (variant, role, token) => {
    render(
      <Alert variant={variant}>
        <AlertTitle>Título {variant}</AlertTitle>
        <AlertDescription>Texto do aviso.</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByRole(role);
    expect(alert.getAttribute("data-variant")).toBe(variant);
    expect(alert.textContent).toContain(`Título ${variant}`);
    expect(classOf(alert)).toContain(`bg-${token}-surface`);
    expect(classOf(alert)).toContain(`border-${token}`);
    const icon = alert.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(classOf(icon!)).toContain(`text-${token}`);
  });

  it("cada variante tem um ícone diferente", () => {
    render(
      <>
        {ALERTS.map(([variant]) => (
          <Alert key={variant} variant={variant} role="note">
            {variant}
          </Alert>
        ))}
      </>,
    );
    const icons = screen.getAllByRole("note").map((alert) => classOf(alert.querySelector("svg")!).split(" ")[1]);
    expect(new Set(icons).size).toBe(ALERTS.length);
  });

  it("aliases default → info e destructive → danger; role explícito prevalece", () => {
    render(
      <>
        <Alert>Padrão</Alert>
        <Alert variant="destructive" role="group" aria-label="Erros">
          Erro
        </Alert>
      </>,
    );
    expect(screen.getByRole("status").getAttribute("data-variant")).toBe("info");
    expect(screen.getByRole("group", { name: "Erros" }).getAttribute("data-variant")).toBe("danger");
  });

  it("Alert sem violações de acessibilidade", async () => {
    const { container } = render(
      <div>
        {ALERTS.map(([variant]) => (
          <Alert key={variant} variant={variant}>
            <AlertTitle>{variant}</AlertTitle>
          </Alert>
        ))}
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});

function ToastButton(options: ToastOptions) {
  const { toast } = useToast();
  return (
    <Button type="button" onClick={() => toast(options)}>
      Notificar
    </Button>
  );
}

const renderToaster = (options: ToastOptions) =>
  render(
    <Toaster>
      <ToastButton {...options} />
    </Toaster>,
  );

describe("005/US2-4 notificação temporária (Toast)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("é anunciada e some depois de 5 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderToaster({ title: "Disciplina salva.", variant: "success" });
    await user.click(screen.getByRole("button", { name: "Notificar" }));
    const toast = screen.getByText("Disciplina salva.").closest("li")!;
    expect(toast.getAttribute("data-variant")).toBe("success");
    expect(toast.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByRole("region", { name: /Notificações/ }).contains(toast)).toBe(true);
    expect(screen.getAllByRole("status").some((region) => region.textContent?.includes("Disciplina salva."))).toBe(
      true,
    );
    act(() => {
      vi.advanceTimersByTime(5_100);
    });
    expect(screen.queryByText("Disciplina salva.")).toBeNull();
  });

  it("pausa enquanto tem o foco", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderToaster({ title: "Convite reenviado.", variant: "info" });
    await user.click(screen.getByRole("button", { name: "Notificar" }));
    act(() => {
      screen.getByRole("button", { name: "Fechar notificação" }).focus();
    });
    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(screen.queryByText("Convite reenviado.")).not.toBeNull();
  });

  it("erro fica até ser fechado", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderToaster({ title: "Não foi possível salvar.", variant: "danger" });
    await user.click(screen.getByRole("button", { name: "Notificar" }));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.queryByText("Não foi possível salvar.")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Fechar notificação" }));
    expect(screen.queryByText("Não foi possível salvar.")).toBeNull();
  });

  it("erro com duration explícito some sozinho (emenda 2026-09-29, recusa do login)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderToaster({ title: "Não foi possível entrar", variant: "danger", duration: 5_000 });
    await user.click(screen.getByRole("button", { name: "Notificar" }));
    expect(screen.getByText("Não foi possível entrar").closest("li")?.getAttribute("data-variant")).toBe("danger");
    act(() => {
      vi.advanceTimersByTime(5_100);
    });
    expect(screen.queryByText("Não foi possível entrar")).toBeNull();
  });
});

describe("005/US2-4 progresso, carregamento, estado vazio e esqueleto", () => {
  it("Progress expõe aria-valuenow e o rótulo", () => {
    render(<Progress value={40} aria-label="Cobertura do plano" />);
    const bar = screen.getByRole("progressbar", { name: "Cobertura do plano" });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(classOf(bar)).toMatch(/\bbg-border\b/);
  });

  it('Spinner tem role="status" com texto e ícone oculto que gira só com movimento', () => {
    render(<Spinner label="Carregando turmas…" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Carregando turmas…");
    const icon = status.querySelector("svg")!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(classOf(icon)).toContain("motion-safe:animate-spin");
  });

  it("EmptyState tem ícone oculto, título, texto e ação", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Nenhuma turma"
        description="Crie a primeira turma."
        action={<Button type="button">Nova turma</Button>}
      />,
    );
    const title = screen.getByRole("heading", { name: "Nenhuma turma" });
    expect(classOf(title)).toMatch(/\btext-h3\b/);
    expect(screen.getByText("Crie a primeira turma.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nova turma" })).toBeTruthy();
    expect(title.parentElement?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("Skeleton é oculto, usa --border e pulsa só com movimento, dentro de um contêiner aria-busy", async () => {
    const { container } = render(
      <section aria-busy="true" aria-label="Lista de turmas">
        <Skeleton className="h-4" />
      </section>,
    );
    const skeleton = container.querySelector('[data-slot="skeleton"]')!;
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(classOf(skeleton)).toMatch(/\bbg-border\b/);
    expect(classOf(skeleton)).toMatch(/(^|\s)motion-safe:animate-pulse\b/);
    expect(classOf(skeleton)).not.toMatch(/(^|\s)animate-pulse\b/);
    await expectNoA11yViolations(container);
  });

  it("sem violações de acessibilidade", async () => {
    const { container } = render(
      <div>
        <Progress value={10} aria-label="Progresso" />
        <Spinner />
        <EmptyState icon={Inbox} title="Vazio" />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});

describe("005/US2-5 ícone sem texto tem nome acessível e dica", () => {
  it("a dica aparece no foco pelo teclado e o botão de ícone tem nome", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="Arquivar tópico">
              <Inbox />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Arquivar tópico</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.tab();
    const button = screen.getByRole("button", { name: "Arquivar tópico" });
    expect(document.activeElement).toBe(button);
    expect((await screen.findByRole("tooltip")).textContent).toContain("Arquivar tópico");
    const content = document.querySelector('[data-slot="tooltip-content"]')!;
    expect(classOf(content)).toContain("z-(--z-tooltip)");
  });
});
