import { axe } from "vitest-axe";

type AxeResults = Awaited<ReturnType<typeof axe>>;

function describeViolations(violations: AxeResults["violations"]): string[] {
  return violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? "n/a"}): ${violation.help} → ${violation.nodes
        .map((node) => node.target.join(" "))
        .join(", ")}`,
  );
}

/**
 * Fails the test with a readable list when axe-core finds WCAG A/AA violations (FR-075, R22).
 * jsdom has no layout, so color contrast is checked by the palette in globals.css, not here.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  const violations = describeViolations(results.violations);
  if (violations.length > 0) {
    throw new Error(`Violações de acessibilidade (axe):\n- ${violations.join("\n- ")}`);
  }
}
