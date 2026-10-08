import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpCounter } from "./help-counter";

describe("015/US3-1 015/FR-015 contador de ajudas do trabalho", () => {
  it.each([
    [0, "Ajudas restantes: 3 de 3"],
    [1, "Ajudas restantes: 2 de 3"],
    [3, "Ajudas restantes: 0 de 3"],
  ])("%i usada(s) → %s", (used, text) => {
    render(<HelpCounter allowance={3} used={used} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
});
