// @vitest-environment node
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../proxy";
import { WEB_ROOT } from "./design-system/scan";

// 005 FR-036 / SC-006: the route groups only choose the frame (contracts/layouts.md). Moving pages
// between groups keeps their URLs and the proxy's redirect to the login page; nothing else changes.

const APP_DIR = join(WEB_ROOT, "app");

/** Every page as [route group, URL], with dynamic segments filled in. */
function pages(dir = APP_DIR): [string, string][] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    if (entry.name !== "page.tsx") return [];
    const segments = relative(APP_DIR, dir).split(sep).filter(Boolean);
    const group = segments.find((segment) => /^\(.+\)$/.test(segment)) ?? "";
    const url = `/${segments
      .filter((segment) => !/^\(.+\)$/.test(segment))
      .map((segment) => (segment.startsWith("[") ? "x" : segment))
      .join("/")}`;
    return [[group, url] as [string, string]];
  });
}

/** Next's matcher syntax as used in proxy.ts: a plain path or a prefix with `/:path*`. */
const matches = (url: string) =>
  config.matcher.some((pattern) =>
    pattern.endsWith("/:path*")
      ? url === pattern.slice(0, -"/:path*".length) || url.startsWith(`${pattern.slice(0, -"/:path*".length)}/`)
      : url === pattern,
  );

const PROTECTED = ["(app)", "(student)", "(account)"];

describe("005/FR-036 005/SC-006 grupos de rota só escolhem a moldura", () => {
  it("toda tela interna, do aluno e de conta continua exigindo sessão no proxy", () => {
    const unprotected = pages()
      .filter(([group, url]) => PROTECTED.includes(group) && !matches(url))
      .map(([group, url]) => `${group} ${url}`);
    expect(unprotected).toEqual([]);
  });

  it("as telas públicas, de entrada e o catálogo seguem fora do proxy", () => {
    const guarded = pages()
      .filter(([group, url]) => ["(auth)", "(public)", "(catalog)"].includes(group) && matches(url))
      .map(([group, url]) => `${group} ${url}`);
    expect(guarded).toEqual([]);
  });

  it("as URLs movidas na 005 continuam as mesmas", () => {
    const urls = new Map(pages().map(([group, url]) => [url, group]));
    expect(urls.get("/minhas-turmas")).toBe("(student)");
    expect(urls.get("/conta/perfil")).toBe("(account)");
    expect(urls.get("/conta/sessoes")).toBe("(account)");
    expect(urls.get("/design-system")).toBe("(catalog)");
    expect(new Set(pages().map(([, url]) => url)).size).toBe(pages().length);
  });
});
