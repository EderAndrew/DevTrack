import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FocusLayout from "./layout";

// 020/US1-5, SC-006: the attempt page of exams and CONTROLLED works lives in the focus layout, which
// has no menu and so no "Enviar feedback" (contracts/web-ui.md).
describe("020/US1-5 layout de foco", () => {
  it("020/US1-5 020/SC-006 sem menu e sem \"Enviar feedback\" na tentativa de prova ou de trabalho controlado", () => {
    render(
      <FocusLayout>
        <h1>Prova de algoritmos</h1>
      </FocusLayout>,
    );
    expect(screen.getByRole("main").id).toBe("conteudo");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Enviar feedback" })).toBeNull();
    expect(screen.queryByText("Enviar feedback")).toBeNull();
  });
});
