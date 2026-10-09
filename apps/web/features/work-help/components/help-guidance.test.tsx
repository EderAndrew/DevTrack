import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { HELP_NONE_USED, HELP_NOT_USED, HELP_PREPARING, HELP_UNAVAILABLE } from "../schemas/work-help";
import { HelpGuidance } from "./help-guidance";
import { helpItem } from "./test-fixtures";

describe("015/FR-022 orientação mostrada na questão, sempre como texto", () => {
  it("015/US3-2 orientação entregue: a pergunta, o texto e o exemplo como código de leitura", async () => {
    const { container } = render(
      <HelpGuidance
        item={helpItem({ message: "Veja <b>isto</b>:\numa ideia", example: { code: "int dobro(int x) {\n  return x * 2;\n}" } })}
        highlight={undefined}
      />,
    );
    expect(screen.getByText("Sua pergunta: Por onde começo?")).toBeTruthy();
    expect(screen.getByText(/Veja <b>isto<\/b>:/)).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("pre")?.textContent).toContain("return x * 2;");
    await expectNoA11yViolations(container);
  });

  it("015/US3-8 fora do assunto: a recusa e \"Esta pergunta não usou uma ajuda.\"", () => {
    render(<HelpGuidance item={helpItem({ status: "OUT_OF_SCOPE", message: "Vamos voltar à questão?" })} highlight={undefined} />);
    expect(screen.getByText("Vamos voltar à questão?")).toBeTruthy();
    expect(screen.getByText(HELP_NOT_USED)).toBeTruthy();
  });

  it.each(["BLOCKED", "FAILED"] as const)("015/US3-9 015/US3-10 %s: indisponível, nenhuma ajuda usada, sem texto", (status) => {
    render(<HelpGuidance item={helpItem({ status, message: null })} highlight={undefined} />);
    expect(screen.getByText(HELP_UNAVAILABLE)).toBeTruthy();
    expect(screen.getByText(HELP_NONE_USED)).toBeTruthy();
  });

  it("pendente: anunciado como status; passado o tempo de espera, a mensagem de indisponível", () => {
    const pending = helpItem({ status: "REQUESTED", message: null, resolvedAt: null });
    const { rerender } = render(<HelpGuidance item={pending} highlight={undefined} />);
    expect(screen.getByRole("status").textContent).toContain(HELP_PREPARING);
    rerender(<HelpGuidance item={pending} highlight={undefined} waitExpired />);
    expect(screen.getByText(HELP_UNAVAILABLE)).toBeTruthy();
  });
});
