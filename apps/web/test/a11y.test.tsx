import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "./a11y";

describe("expectNoA11yViolations", () => {
  it("passes for an accessible fragment", async () => {
    const { container } = render(
      <form aria-label="Busca">
        <label htmlFor="q">Buscar</label>
        <input id="q" />
      </form>,
    );
    await expectNoA11yViolations(container);
  });

  it("fails for an unlabelled input (control)", async () => {
    const { container } = render(<input />);
    await expect(expectNoA11yViolations(container)).rejects.toThrow(/label/);
  });
});
