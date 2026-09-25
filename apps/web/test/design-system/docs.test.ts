// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REGISTRY } from "@/features/design-system/registry";
import { WEB_ROOT } from "./scan";

// 005 US4-3 (FR-032; research V17, V19): the documentation covers every token and every entry
// of the catalog, so the rules outlive this feature.

const doc = (file: string) => readFileSync(join(WEB_ROOT, "design-system", file), "utf8");

/** Body of the `## title` section (up to the next `## `), or null when the heading is missing. */
function section(markdown: string, title: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.indexOf(`## ${title}`);
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

/** Custom properties declared in tokens.css, without Tailwind's `--color-*` bindings and resets. */
function declaredTokens(): string[] {
  const css = readFileSync(join(WEB_ROOT, "design-system/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const names = [...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(([, name]) => name!);
  return [...new Set(names)].filter(
    (name) => !name.startsWith("--color-") && !name.endsWith("-*") && !/--(line-height|font-weight)$/.test(name),
  );
}

const SUBSECTIONS = ["Variantes", "Estados", "Quando usar", "Quando não usar", "Exemplo", "Acessibilidade"];

describe("005/US4-3 005/FR-032 documentação do Design System", () => {
  it("README.md tem as seções de princípios, cores, regras contra UI genérica, camadas e uso, com conteúdo", () => {
    const readme = doc("README.md");
    for (const title of [
      "Princípios",
      "Cores e a regra 80/15/5",
      "Regras contra UI genérica",
      "Arquitetura em camadas",
      "Como usar",
    ]) {
      expect(section(readme, title)?.trim(), title).toBeTruthy();
    }
  });

  it("tokens.md cita cada token de tokens.css", () => {
    const tokens = doc("tokens.md");
    const names = declaredTokens();
    expect(names.length).toBeGreaterThan(50);
    expect(names.filter((name) => !tokens.includes(`\`${name}\``))).toEqual([]);
  });

  it.each(REGISTRY.map((entry) => [entry.name, entry] as const))(
    "%s tem seção em components.md ou layouts.md com os subtítulos",
    (name, entry) => {
      const body = section(doc(entry.group === "layouts" ? "layouts.md" : "components.md"), name);
      expect(body, `seção "## ${name}"`).not.toBeNull();
      const missing = SUBSECTIONS.filter((title) => !body!.includes(`### ${title}\n`));
      expect(missing, name).toEqual([]);
    },
  );

  it("components.md e layouts.md não documentam o que não está no catálogo", () => {
    const documented = (file: string) => [...doc(file).matchAll(/^## (.+)$/gm)].map(([, title]) => title!);
    const names = REGISTRY.map((entry) => entry.name);
    expect([...documented("components.md"), ...documented("layouts.md")].filter((t) => !names.includes(t))).toEqual([]);
  });
});
