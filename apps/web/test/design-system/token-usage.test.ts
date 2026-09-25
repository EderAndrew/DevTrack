// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEB_ROOT,
  checkRepository,
  checkText,
  describeViolation,
  exceptionMarkers,
  type Rule,
} from "./scan";

// 005 research V9 (FR-033): only the official tokens reach the screens. The heuristic is checked
// on sample snippets; the repository tests then list every occurrence left to migrate (US1 for
// `valores`, US2 for `controles`).

const FEATURE = "features/x/components/a.tsx";

const found = (code: string, rule: Rule = "valores", file = FEATURE) =>
  checkText(file, code)
    .filter((violation) => violation.rule === rule)
    .map((violation) => violation.found);

describe("005/US7-1 005/FR-033 regra valores: recusa valores fora dos tokens", () => {
  it.each([
    ['const c = "#1f4fd1";', "#1f4fd1"],
    ['<p className="text-[#abc]">', "#abc"],
    ['const c = "rgb(0 0 0)";', "rgb("],
    ['const c = "rgba(0, 0, 0, 0.5)";', "rgba("],
    ['const c = "hsl(210 40% 50%)";', "hsl("],
    ['const c = "oklch(0.6 0.1 250)";', "oklch("],
  ])("cor literal em %s", (code, literal) => {
    expect(found(code)).toContain(literal);
  });

  it.each([
    "bg-red-500",
    "text-white",
    "bg-black",
    "border-slate-200",
    "hover:bg-blue-600/50",
    "ring-sky-300",
  ])("classe da paleta padrão %s", (cls) => {
    expect(found(`<div className="p-2 ${cls}">`)).toEqual([cls]);
  });

  it.each([
    "text-[13px]",
    "p-[7px]",
    "rounded-[4px]",
    "shadow-[0_0_0_1px_var(--x)]",
    "font-[system-ui]",
    "bg-[#fff]",
    "gap-[3px]",
    "leading-[1.1]",
  ])("valor arbitrário %s", (cls) => {
    expect(found(`<div className="${cls}">`)).toContain(cls);
  });

  it.each([
    "text-sm",
    "text-2xl",
    "text-base",
    "rounded-xl",
    "rounded",
    "rounded-t-2xl",
    "shadow-lg",
    "shadow",
    "font-serif",
    "font-light",
  ])("escala padrão %s", (cls) => {
    expect(found(`<div className="${cls}">`)).toEqual([cls]);
  });

  it.each(["gap-1.5", "px-2.5", "p-7", "-mt-3.5", "space-y-0.5", "md:py-9"])(
    "passo de espaçamento fora da escala %s",
    (cls) => {
      expect(found(`<div className="${cls}">`)).toEqual([cls]);
    },
  );

  it.each([
    ["<p style={{ color: 'red' }}>", "style color"],
    ["<p style={{ fontSize: 13 }}>", "style fontSize"],
    ["<p style={{ padding: 8 }}>", "style padding"],
    ["<p\n  style={{\n    marginTop: 4,\n  }}\n>", "style marginTop"],
  ])("estilo em linha %s", (code, what) => {
    expect(found(code)).toEqual([what]);
  });

  it.each(["2xl:p-4", "max-sm:hidden", "min-[900px]:flex", "max-md:p-2"])(
    "ponto de quebra inexistente %s",
    (cls) => {
      expect(found(`<div className="${cls}">`)).toEqual([cls]);
    },
  );

  it.each(["sm:p-4", "md:flex", "lg:grid-cols-2", "xl:px-6"])(
    "ponto de quebra oficial %s é aceito",
    (cls) => {
      expect(found(`<div className="${cls}">`)).toEqual([]);
    },
  );

  it("ícone Lucide fora de size-4, size-5 e size-6", () => {
    const code = [
      'import { Check, X as Close } from "lucide-react";',
      '<Check className="size-3" />',
      '<Close aria-hidden className="size-8" />',
      "<Check",
      '  className="size-3.5"',
      "/>",
      '<Check className="size-5" />',
    ].join("\n");
    expect(found(code)).toEqual([
      "<Check> size-3",
      "<Close> size-8",
      "<Check> size-3.5",
    ]);
    expect(found('<span className="[&_svg]:size-3">')).toEqual([
      "[&_svg]:size-3",
    ]);
  });

  it("aceita tamanho e posição, tokens e utilitários sem escala", () => {
    const code =
      "<div className=\"min-h-11 size-5 top-[50%] max-h-[90vh] w-[calc(100%-2rem)] bg-primary text-foreground text-body-sm text-h2 rounded-md rounded-full shadow-overlay font-mono font-semibold p-4 gap-x-2 -mx-1 p-px mx-auto text-center [&_svg:not([class*='size-'])]:size-4 grid-cols-[1fr_auto]\">";
    expect(found(code)).toEqual([]);
  });

  it("005/US7-3 aceita a linha com ds-exception: <motivo> na própria linha ou na anterior", () => {
    expect(
      found(
        '<div className="p-7" /> {/* ds-exception: alinhamento com a régua */}',
      ),
    ).toEqual([]);
    expect(
      found(
        '// ds-exception: alinhamento com a régua\n<div className="p-7" />',
      ),
    ).toEqual([]);
    expect(
      found(
        '// ds-exception: alinhamento com a régua\n\n<div className="p-7" />',
      ),
    ).toEqual(["p-7"]);
  });

  it("falha com arquivo:linha na mensagem", () => {
    const [violation] = checkText(
      FEATURE,
      'export const a = 1;\n<div className="bg-red-500" />',
    );
    expect(describeViolation(violation!)).toMatch(
      /^features\/x\/components\/a\.tsx:2 bg-red-500 — /,
    );
  });
});

describe("005/US7-1 005/FR-033 regra controles: recusa controles recriados fora de components/ui", () => {
  it.each([
    ['<button type="button">', "<button>"],
    ["<select value={v}>", "<select>"],
    ["<textarea rows={3} />", "<textarea>"],
    ["<table>", "<table>"],
    ['<input type="checkbox" />', '<input type="checkbox">'],
    ['<input\n  id="a"\n  type="radio"\n/>', '<input type="radio">'],
  ])("%s", (code, what) => {
    expect(found(code, "controles")).toEqual([what]);
  });

  it("aceita os mesmos elementos em components/ui e o <input> de texto em qualquer lugar", () => {
    expect(
      found(
        '<button type="button"><table><input type="checkbox" />',
        "controles",
        "components/ui/a.tsx",
      ),
    ).toEqual([]);
    expect(
      found('<input type="email" onChange={() => x} />', "controles"),
    ).toEqual([]);
  });
});

describe("005/US1-1 005/SC-001 nenhum valor fora dos tokens em app, features e components", () => {
  it("regra valores no repositório", () => {
    expect(checkRepository("valores").map(describeViolation)).toEqual([]);
  });
});

describe("005/US2-6 nenhum controle recriado fora de components/ui", () => {
  it("regra controles no repositório", () => {
    expect(checkRepository("controles").map(describeViolation)).toEqual([]);
  });
});

/** Rows of the table in design-system/exceptions.md: file, snippet and reason. */
function documentedExceptions(): {
  file: string;
  snippet: string;
  reason: string;
}[] {
  const doc = readFileSync(
    join(WEB_ROOT, "design-system/exceptions.md"),
    "utf8",
  );
  return doc
    .split("\n")
    .filter((row) => row.startsWith("|") && !/^\|\s*(Arquivo|-)/.test(row))
    .map((row) => {
      const [file, snippet, reason] = row
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim().replace(/^`|`$/g, ""));
      return { file: file!, snippet: snippet!, reason: reason! };
    });
}

describe("005/US7-3 exceções do código = design-system/exceptions.md", () => {
  it("cada ds-exception do código está na tabela, e cada linha da tabela está no código", () => {
    const code = exceptionMarkers()
      .map((marker) => `${marker.file} — ${marker.reason}`)
      .sort();
    const doc = documentedExceptions()
      .map((row) => `${row.file} — ${row.reason}`)
      .sort();
    expect(doc).toEqual(code);
  });

  it("o trecho de cada linha da tabela está no código coberto pela exceção", () => {
    const markers = exceptionMarkers();
    for (const row of documentedExceptions()) {
      const covered = markers.some(
        (marker) =>
          marker.file === row.file &&
          marker.reason === row.reason &&
          marker.covers.includes(row.snippet),
      );
      expect(covered, `${row.file}: ${row.snippet}`).toBe(true);
    }
  });
});
