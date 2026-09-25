// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("005/US1-1 cn conhece os tokens do Design System", () => {
  it("tamanho de texto e cor de texto não se anulam", () => {
    expect(cn("text-body-sm", "text-muted-foreground")).toBe("text-body-sm text-muted-foreground");
    expect(cn("text-label text-foreground")).toBe("text-label text-foreground");
    expect(cn("text-reading", "text-text-secondary")).toBe("text-reading text-text-secondary");
  });

  it("um tamanho de texto substitui o outro", () => {
    expect(cn("text-body", "text-h3")).toBe("text-h3");
    expect(cn("text-caption", "text-reading")).toBe("text-reading");
  });

  it("sombra e curva de animação oficiais", () => {
    expect(cn("shadow-sm", "shadow-overlay")).toBe("shadow-overlay");
    expect(cn("ease-standard", "ease-linear")).toBe("ease-linear");
  });
});
