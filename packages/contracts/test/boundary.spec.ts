import { describe, expect, it } from "vitest";
import { listFiles, readRepoFile, scanSource } from "./helpers/source-scan.js";

// Principle XXVI / FR-005: the package describes only the API↔web boundary. No persistence,
// framework, UI or app code, and no user-facing text (the web owns its messages, S8).

const FORBIDDEN_IMPORT = /^(@prisma\/|@nestjs\/|@reduxjs\/|react$|react-dom($|\/)|next($|\/)|express$)|(^|\/)apps\//;
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;

function forbiddenImports(source: string): string[] {
  const { code } = scanSource(source);
  return [...code.matchAll(IMPORT_SPECIFIER)].map((match) => match[1]!).filter((spec) => FORBIDDEN_IMPORT.test(spec));
}

/** Heuristic for user-facing text: any string literal with a space (S7). */
function textLiterals(source: string) {
  return scanSource(source).strings.filter((literal) => /\s/.test(literal.value));
}

const sources = listFiles("packages/contracts/src", /\.ts$/).map((path) => ({ path, text: readRepoFile(path) }));

describe("002/US1-5 fronteira do pacote de contratos (FR-005)", () => {
  it("varre os arquivos do pacote", () => {
    expect(sources.map((source) => source.path)).toContain("packages/contracts/src/index.ts");
  });

  it("não importa persistência, framework, UI nem código de apps/", () => {
    const offenders = sources.flatMap(({ path, text }) => forbiddenImports(text).map((spec) => `${path}: ${spec}`));
    expect(offenders).toEqual([]);
  });

  it("não contém textos destinados ao usuário", () => {
    const offenders = sources.flatMap(({ path, text }) =>
      textLiterals(text).map((literal) => `${path}:${literal.line} ${JSON.stringify(literal.value)}`),
    );
    expect(offenders).toEqual([]);
  });

  it("a heurística detecta imports proibidos e textos, e ignora comentários", () => {
    const sample = [
      'import { PrismaClient } from "@prisma/client";',
      'import { Injectable } from "@nestjs/common";',
      'import type { ReactNode } from "react";',
      'import { schema } from "../../apps/api/src/platform/http/schemas";',
      'import { z } from "zod";',
      "// Dados inválidos. (comentário, permitido)",
      "/* Recurso não encontrado. */",
      'export const message = "Dados inválidos.";',
      'export const code = "VALIDATION_ERROR";',
    ].join("\n");

    expect(forbiddenImports(sample)).toEqual([
      "@prisma/client",
      "@nestjs/common",
      "react",
      "../../apps/api/src/platform/http/schemas",
    ]);
    expect(textLiterals(sample)).toEqual([{ value: "Dados inválidos.", line: 8 }]);
  });
});
