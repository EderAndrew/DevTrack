// @vitest-environment node
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// 002/US4-5 (FR-025): the layer rules of contracts/web-architecture.md, checked with the real
// eslint.config.js on virtual files. The shared config turns every error into a warning
// (eslint-plugin-only-warn) and `pnpm lint` runs with --max-warnings 0, so any report fails CI.

const cwd = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd });

const RESTRICTED = new Set(["no-restricted-imports", "no-restricted-globals", "no-restricted-properties"]);

async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: true });
  return result!.messages.filter((message) => message.ruleId && RESTRICTED.has(message.ruleId)).map((message) => message.message);
}

const API_CLIENT = 'import { apiClient } from "@/lib/api/client";\nexport const x = apiClient;\n';
const SERVER_READ = 'import { fetchX } from "@/features/x/api/server";\nexport const x = fetchX;\n';

describe("002/US4-5 lint impede componente de chamar a API (FR-025)", () => {
  it.each([
    "features/x/components/a.tsx",
    "features/x/hooks/a.ts",
    "components/shared/a.tsx",
    "app/x/page.tsx",
    "app/layout.tsx",
  ])("import de @/lib/api/* em %s é recusado", async (path) => {
    expect(await violations(path, API_CLIENT)).not.toEqual([]);
  });

  it("import relativo de lib/api também é recusado", async () => {
    const code = 'import { apiClient } from "../../../lib/api/client";\nexport const x = apiClient;\n';
    expect(await violations("features/x/components/a.tsx", code)).not.toEqual([]);
  });

  it.each(["features/x/api/a.ts", "features/x/api/server.ts", "lib/query/a.ts"])(
    "import de @/lib/api/* em %s é permitido",
    async (path) => {
      expect(await violations(path, API_CLIENT)).toEqual([]);
    },
  );

  it.each(["features/x/components/a.tsx", "features/x/hooks/a.ts", "features/x/api/a.ts", "app/x/page.tsx", "components/shared/a.tsx"])(
    "fetch(...) em %s é recusado",
    async (path) => {
      expect(await violations(path, 'export const x = () => fetch("/api/me");\n')).not.toEqual([]);
      expect(await violations(path, 'export const x = () => window.fetch("/api/me");\n')).not.toEqual([]);
      expect(await violations(path, "export const x = () => new XMLHttpRequest();\n")).not.toEqual([]);
      expect(await violations(path, "export const x = () => new window.XMLHttpRequest();\n")).not.toEqual([]);
    },
  );

  it.each(["lib/api/client.ts", "e2e/a.spec.ts", "features/x/components/a.test.tsx"])("fetch(...) em %s é permitido", async (path) => {
    expect(await violations(path, 'export const x = () => fetch("/api/me");\n')).toEqual([]);
    expect(await violations(path, "export const x = () => new XMLHttpRequest();\n")).toEqual([]);
  });

  it.each([
    ['import { configureStore } from "@reduxjs/toolkit";\nexport const x = configureStore;\n'],
    ['import axios from "axios";\nexport const x = axios;\n'],
  ])("%s é recusado em qualquer arquivo", async (code) => {
    for (const path of ["features/x/api/a.ts", "lib/api/client.ts", "app/x/page.tsx", "components/shared/a.tsx"]) {
      expect(await violations(path, code), path).not.toEqual([]);
    }
  });

  it.each(["features/x/components/a.tsx", "features/x/hooks/a.ts", "components/shared/a.tsx"])(
    "leitura de servidor (features/*/api/server) em %s, que roda no cliente, é recusada",
    async (path) => {
      expect(await violations(path, SERVER_READ)).not.toEqual([]);
      const relative = 'import { fetchX } from "../api/server";\nexport const x = fetchX;\n';
      expect(await violations(path, relative)).not.toEqual([]);
    },
  );

  it("leitura de servidor em app/x/page.tsx é permitida", async () => {
    expect(await violations("app/x/page.tsx", SERVER_READ)).toEqual([]);
  });

  it("componentes compartilhados não usam @repo/contracts como valor, só como tipo", async () => {
    const value = 'import { ErrorCodeSchema } from "@repo/contracts";\nexport const x = ErrorCodeSchema;\n';
    const type = 'import type { ErrorCode } from "@repo/contracts";\nexport const x = (c: ErrorCode) => c;\n';
    expect(await violations("components/shared/a.tsx", value)).not.toEqual([]);
    expect(await violations("components/shared/a.tsx", type)).toEqual([]);
    expect(await violations("features/x/schemas/a.ts", value)).toEqual([]);
  });
});
