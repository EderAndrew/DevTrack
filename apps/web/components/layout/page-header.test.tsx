import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { expectNoA11yViolations } from "../../test/a11y";
import { expectTabOrder } from "../../test/keyboard";
import { PageHeader } from "./page-header";

// 005 US3-1 (FR-019, FR-023; contracts/components.md "PageHeader").

describe("005/US3-1 PageHeader", () => {
  it("só o título: <h1> em text-h1", () => {
    render(<PageHeader title="Turmas" />);
    const title = screen.getByRole("heading", { level: 1, name: "Turmas" });
    expect(title.getAttribute("class")).toMatch(/\btext-h1\b/);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("trilha, título, situação, descrição e ações, nessa ordem de foco", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PageHeader
        breadcrumb={[{ label: "Turmas", href: "/turmas" }, { label: "ADS3" }]}
        title="ADS3"
        status={<span>Ativa</span>}
        description="2026.2 · Programação Orientada a Objetos"
        actions={<Button type="button">Editar</Button>}
      />,
    );
    const trail = screen.getByRole("navigation", { name: "Trilha" });
    expect(within(trail).getByText("ADS3").getAttribute("aria-current")).toBe("page");
    expect(
      within(trail)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Turmas"]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ADS3");
    expect(screen.getByText("Ativa")).toBeTruthy();
    expect(screen.getByText("2026.2 · Programação Orientada a Objetos")).toBeTruthy();
    await expectTabOrder(user, [
      screen.getByRole("link", { name: "Turmas" }),
      screen.getByRole("button", { name: "Editar" }),
    ]);
    await expectNoA11yViolations(container);
  });
});
