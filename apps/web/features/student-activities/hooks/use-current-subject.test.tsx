import type { MyClassView } from "@repo/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestQueryClient } from "../../../test/render";
import { json, routedFetch } from "../components/test-fixtures";
import { useCurrentSubject } from "./use-current-subject";

const myClass = (overrides: Partial<MyClassView>): MyClassView => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "ADS 3NA",
  code: "ADS-3NA",
  academicYear: 2026,
  period: "2026.2",
  teacherName: "Eder Professor",
  subjectName: "Object Oriented Programming",
  enrolledAt: "2026-11-10T12:00:00.000Z",
  ...overrides,
});
const POO = myClass({});
const SQL = myClass({ id: "22222222-2222-4222-8222-222222222222", subjectName: "Banco de Dados", enrolledAt: "2026-11-01T12:00:00.000Z" });

function setup(items: MyClassView[], materia: string | null) {
  vi.stubGlobal("fetch", routedFetch({ "GET /api/me/classes": json(200, { items }) }).fetch);
  const client = makeTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useCurrentSubject(materia), { wrapper });
}

describe("026 useCurrentSubject — qual matéria a tela mostra", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("026/FR-003 sem matéria no endereço, a primeira de \"Minhas turmas\" (a matrícula mais recente)", async () => {
    const { result } = setup([POO, SQL], null);
    expect(result.current.isPending).toBe(true);
    expect(result.current.current).toBeNull();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.current?.id).toBe(POO.id);
    expect(result.current.unavailable).toBe(false);
  });

  it("026/FR-002 as opções são as turmas da lista, na ordem dela, sem \"Todas\"", async () => {
    const { result } = setup([POO, SQL], SQL.id);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.options.map((option) => option.label)).toEqual([
      "Object Oriented Programming · ADS 3NA",
      "Banco de Dados · ADS 3NA",
    ]);
    expect(result.current.options.some((option) => /todas/i.test(option.label))).toBe(false);
    expect(result.current.current?.id).toBe(SQL.id);
  });

  it("026/FR-011 uma matéria que não está na lista: a primeira, marcada como indisponível", async () => {
    const { result } = setup([POO, SQL], "99999999-9999-4999-8999-999999999999");
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.current?.id).toBe(POO.id);
    expect(result.current.unavailable).toBe(true);
  });

  it("026/FR-012 sem matrícula ativa: nenhuma matéria (sem card), nem com matéria no endereço", async () => {
    const { result } = setup([], POO.id);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.current).toBeNull();
    expect(result.current.options).toEqual([]);
    expect(result.current.unavailable).toBe(false);
  });
});
