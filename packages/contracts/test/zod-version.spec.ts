import { describe, expect, it } from "vitest";
import { readRepoFile } from "./helpers/source-scan.js";

// FR-007: API, web and contracts share one Zod instance, pinned by the pnpm catalog (S2).
describe("002/US1-6 versão única de Zod no workspace (FR-007)", () => {
  const lockfile = readRepoFile("pnpm-lock.yaml");

  it("o pnpm-lock.yaml resolve exatamente uma versão de zod", () => {
    const versions = new Set([...lockfile.matchAll(/^ {2}'?zod@(\d[^:'(\s]*)/gm)].map((match) => match[1]));
    expect([...versions]).toHaveLength(1);
  });

  it("api, web e contratos pedem zod pelo catálogo", () => {
    for (const manifest of ["apps/api/package.json", "apps/web/package.json", "packages/contracts/package.json"]) {
      const { dependencies } = JSON.parse(readRepoFile(manifest)) as { dependencies?: Record<string, string> };
      expect(dependencies?.zod, manifest).toBe("catalog:");
    }
  });
});
