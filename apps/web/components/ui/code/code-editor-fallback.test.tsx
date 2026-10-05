import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CodeEditor } from "./code-editor";

// 014/FR-014 (research L6): when the editor chunk can't be loaded, the editor stays the 012
// textarea and keeps reporting the same `onChange` stream.
vi.mock("./load-editor", () => {
  throw new Error("chunk indisponível");
});

describe("014/FR-014 sem o chunk do CodeMirror o editor continua o textarea", () => {
  it("lê, digita, indenta com Tab e sai com Esc e Tab", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Host() {
      const [value, setValue] = useState("class A {}");
      return (
        <>
          <span id="r">Sua resposta (Java)</span>
          <CodeEditor id="ed" aria-labelledby="r" highlight="java" value={value} onChange={(next) => (onChange(next), setValue(next))} />
          <button type="button">depois</button>
        </>
      );
    }
    const { container } = render(<Host />);
    const textarea = screen.getByRole("textbox", { name: "Sua resposta (Java)" }) as HTMLTextAreaElement;
    await user.click(textarea);
    await user.keyboard("{End}{Enter}x{Tab}y");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.querySelector(".cm-content")).toBeNull();
    expect(container.querySelector("textarea")).toBe(textarea);
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("class A {}\nx  y");
    await user.keyboard("{Escape}{Tab}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "depois" }));
  });
});
