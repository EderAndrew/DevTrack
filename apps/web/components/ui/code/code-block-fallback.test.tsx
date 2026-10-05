import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodeBlock } from "./code-block";

// 014 research L4: when the highlighter chunk can't be loaded, the code stays plain text.
vi.mock("./load-highlighter", () => {
  throw new Error("chunk indisponível");
});

describe("014/US2 CodeBlock sem o chunk do realce", () => {
  it("mostra o texto puro quando o import() é rejeitado", async () => {
    const code = 'String nome = "Ana";';
    const { container } = render(<CodeBlock code={code} highlight="java" label="Solução de referência" />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const element = container.querySelector("pre code")!;
    expect(element.querySelector("span[class]")).toBeNull();
    expect(element.textContent).toBe(code);
  });
});
