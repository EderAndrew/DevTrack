import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { Badge } from "./badge";
import { Breadcrumb } from "./breadcrumb";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Pagination } from "./pagination";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "./sheet";
import { Status } from "./status";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "./table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

// 005 US2 (FR-017, FR-018, FR-019, FR-020; contracts/components.md "Contêineres", "Dados" e
// "Navegação"). The US2-6 scenario is the `controles` repository test (T010).

const classOf = (element: Element) => element.getAttribute("class") ?? "";
const SEMANTIC = ["neutral", "info", "success", "warning", "danger"] as const;

describe("005/US2-1 contêineres", () => {
  it("Card: --surface, borda --border, rounded-md e sem sombra", () => {
    render(
      <Card aria-label="Turma">
        <CardHeader>
          <CardTitle>Turma A</CardTitle>
        </CardHeader>
        <CardContent>Conteúdo</CardContent>
      </Card>,
    );
    const card = screen.getByLabelText("Turma");
    expect(classOf(card)).toMatch(/\bbg-card\b/);
    expect(classOf(card)).toMatch(/\bborder-border\b/);
    expect(classOf(card)).toMatch(/\brounded-md\b/);
    expect(classOf(card)).not.toMatch(/\bshadow/);
  });

  it("Dialog prende o foco, fecha com Esc e devolve o foco", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Editar tópico</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Editar tópico</DialogTitle>
          <DialogDescription>Altere o título.</DialogDescription>
          <Button>Salvar</Button>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Editar tópico" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Editar tópico" });
    expect(classOf(dialog)).toMatch(/\brounded-lg\b/);
    expect(classOf(dialog)).toMatch(/\bshadow-overlay\b/);
    expect(classOf(dialog)).toContain("z-(--z-modal)");
    expect(classOf(document.querySelector('[data-slot="dialog-overlay"]')!)).toMatch(/\bbg-overlay\b/);
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("AlertDialog de confirmação destrutiva usa a ação danger", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="danger">Remover aluno</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover aluno?</AlertDialogTitle>
            <AlertDialogDescription>O aluno perde o acesso à turma.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={onConfirm}>
              Remover aluno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const trigger = screen.getByRole("button", { name: "Remover aluno" });
    await user.click(trigger);
    const dialog = screen.getByRole("alertdialog", { name: "Remover aluno?" });
    const confirm = within(dialog).getByRole("button", { name: "Remover aluno" });
    expect(confirm.getAttribute("data-variant")).toBe("danger");
    await user.tab();
    await user.tab();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("Sheet abre pela lateral com --overlay e --z-modal", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger asChild>
          <Button>Menu</Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetTitle>Navegação</SheetTitle>
          <SheetDescription>Áreas do sistema.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const sheet = screen.getByRole("dialog", { name: "Navegação" });
    expect(classOf(sheet)).toContain("z-(--z-modal)");
    expect(classOf(sheet)).toMatch(/\bshadow-overlay\b/);
    expect(classOf(document.querySelector('[data-slot="sheet-overlay"]')!)).toMatch(/\bbg-overlay\b/);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Popover fecha com Esc e devolve o foco", async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Filtros</Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Filtros da lista">
          <Button>Aplicar</Button>
        </PopoverContent>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "Filtros" });
    await user.click(trigger);
    const content = screen.getByRole("dialog", { name: "Filtros da lista" });
    expect(classOf(content)).toMatch(/\bshadow-overlay\b/);
    expect(classOf(content)).toContain("z-(--z-dropdown)");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("DropdownMenu: setas, Home/End, Esc e item destrutivo em --danger-text", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Ações</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Tópico</DropdownMenuLabel>
          <DropdownMenuItem>Editar</DropdownMenuItem>
          <DropdownMenuItem>Dividir</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="danger" onSelect={onArchive}>
            Arquivar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Ações" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = screen.getByRole("menu");
    expect(classOf(menu)).toContain("z-(--z-dropdown)");
    const items = within(menu).getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(items[2]);
    expect(classOf(items[2]!)).toMatch(/\btext-danger-text\b/);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onArchive).not.toHaveBeenCalled();
  });
});

describe("005/US2-4 dados", () => {
  const table = (density?: "comfortable" | "compact") => (
    <Table density={density}>
      <TableCaption>Alunos da turma</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>Situação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableHead scope="row">Ana</TableHead>
          <TableCell>Ativa</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );

  it("Table: cabeçalhos com scope, text-label, legenda e densidade", () => {
    const { rerender } = render(table());
    const grid = screen.getByRole("table", { name: "Alunos da turma" });
    expect(grid.getAttribute("data-density")).toBe("comfortable");
    const [name, status] = screen.getAllByRole("columnheader");
    expect([name!.getAttribute("scope"), status!.getAttribute("scope")]).toEqual(["col", "col"]);
    expect(classOf(name!)).toMatch(/\btext-label\b/);
    expect(screen.getByRole("rowheader", { name: "Ana" }).getAttribute("scope")).toBe("row");
    rerender(table("compact"));
    expect(screen.getByRole("table").getAttribute("data-density")).toBe("compact");
  });

  it('Pagination: nav "Paginação", página atual com aria-current e anterior/próxima com texto', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />);
    const nav = screen.getByRole("navigation", { name: "Paginação" });
    const current = within(nav).getByRole("button", { name: "Página 2" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(
      within(nav)
        .getAllByRole("button")
        .filter((b) => b.hasAttribute("aria-current")),
    ).toHaveLength(1);
    await user.click(within(nav).getByRole("button", { name: /Próxima/ }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    await user.click(within(nav).getByRole("button", { name: /Anterior/ }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    rerender(<Pagination page={1} totalPages={5} onPageChange={onPageChange} />);
    expect((screen.getByRole("button", { name: /Anterior/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(SEMANTIC)("Badge %s: text-label, fundo e texto semânticos, sempre com texto", (variant) => {
    render(<Badge variant={variant}>Ativa</Badge>);
    const badge = screen.getByText("Ativa");
    expect(badge.getAttribute("data-variant")).toBe(variant);
    expect(classOf(badge)).toMatch(/\btext-label\b/);
    if (variant !== "neutral") {
      expect(classOf(badge)).toContain(`bg-${variant}-surface`);
      expect(classOf(badge)).toContain(`text-${variant}-text`);
    }
  });

  it.each(SEMANTIC)("Status %s: ponto oculto e o texto da situação", (variant) => {
    render(<Status variant={variant}>Envio falhou</Status>);
    const status = screen.getByText("Envio falhou");
    expect(status.getAttribute("data-variant")).toBe(variant);
    const dot = status.querySelector("[aria-hidden]");
    expect(dot).not.toBeNull();
    expect(status.textContent).toBe("Envio falhou");
  });

  it("Tabs: setas trocam de aba e marcam aria-selected", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="alunos">
        <TabsList aria-label="Seções da turma">
          <TabsTrigger value="alunos">Alunos</TabsTrigger>
          <TabsTrigger value="convites">Convites</TabsTrigger>
        </TabsList>
        <TabsContent value="alunos">Lista de alunos</TabsContent>
        <TabsContent value="convites">Lista de convites</TabsContent>
      </Tabs>,
    );
    const alunos = screen.getByRole("tab", { name: "Alunos" });
    const convites = screen.getByRole("tab", { name: "Convites" });
    expect(alunos.getAttribute("aria-selected")).toBe("true");
    await user.tab();
    expect(document.activeElement).toBe(alunos);
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(convites);
    expect(convites.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Lista de convites");
  });
});

describe("005/US2-1 navegação", () => {
  it('Breadcrumb: nav "Trilha", página atual com aria-current e sem link', () => {
    render(
      <Breadcrumb
        items={[
          { label: "Minhas turmas", href: "/turmas" },
          { label: "Turma A", href: "/turmas/1" },
          { label: "Planejamento" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Trilha" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Minhas turmas", "Turma A"]);
    const current = within(nav).getByText("Planejamento");
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.closest("a")).toBeNull();
    expect([...nav.querySelectorAll("svg")].every((icon) => icon.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});

describe("005/SC-003 contêineres e dados sem violações de acessibilidade", () => {
  it("axe", async () => {
    const { container } = render(
      <div>
        <Card>
          <CardContent>Cartão</CardContent>
        </Card>
        <Table>
          <TableCaption>Tabela</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Coluna</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Valor</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Pagination page={1} totalPages={3} onPageChange={() => undefined} />
        {SEMANTIC.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
        <Status variant="success">Ativa</Status>
        <Tabs defaultValue="a">
          <TabsList aria-label="Abas">
            <TabsTrigger value="a">A</TabsTrigger>
            <TabsTrigger value="b">B</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Painel A</TabsContent>
        </Tabs>
        <Breadcrumb items={[{ label: "Início", href: "/" }, { label: "Atual" }]} />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
