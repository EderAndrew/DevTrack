import type { MySubjectClass } from "@/features/my-classes/schemas/my-classes";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestQueryClient } from "../../../test/render";
import { json, myClassesBody, routedFetch } from "../components/test-fixtures";
import { useCurrentSubject } from "./use-current-subject";

const myClass = (overrides: Partial<MySubjectClass>): MySubjectClass => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "ADS 3NA",
  code: "ADS-3NA",
  academicYear: 2026,
  period: "2026.2",
  teacherName: "Eder Professor",
  subjectName: "Object Oriented Programming",
  status: "ACTIVE",
  ...overrides,
});
const POO = myClass({});
const SQL = myClass({ id: "22222222-2222-4222-8222-222222222222", subjectName: "Banco de Dados" });

function setup(items: MySubjectClass[], materia: string | null) {
  vi.stubGlobal("fetch", routedFetch({ "GET /api/me/classes": json(200, myClassesBody(items)) }).fetch);
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

  describe("027/US8 o card só com as disciplinas ativas", () => {
    const CLOSED = myClass({ id: "33333333-3333-4333-8333-333333333333", name: "ADS 2NA", academicYear: 2025, subjectName: "Redes", status: "INACTIVE" });
    const ARCHIVED = myClass({ id: "44444444-4444-4444-8444-444444444444", subjectName: "Cálculo", status: "ARCHIVED" });

    it("027/US8-3 027/US8-4 sem matéria no endereço: a primeira ativa; encerrada e arquivada fora das opções", async () => {
      const { result } = setup([ARCHIVED, POO, CLOSED, SQL], null);
      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.current?.id).toBe(POO.id);
      expect(result.current.options.map((option) => option.id)).toEqual([POO.id, SQL.id]);
      expect(result.current.unavailable).toBe(false);
    });

    it("027/US8-3 vinda de \"Minhas turmas\", a disciplina encerrada é mostrada só para leitura e entra nas opções", async () => {
      const { result } = setup([POO, CLOSED, SQL], CLOSED.id);
      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.current).toMatchObject({ id: CLOSED.id, status: "INACTIVE" });
      expect(result.current.options.map((option) => option.label)).toEqual([
        "Object Oriented Programming · ADS 3NA",
        "Banco de Dados · ADS 3NA",
        "Redes · ADS 2NA · Encerrada",
      ]);
      expect(result.current.unavailable).toBe(false);
    });

    it("027/US8-2 só turmas encerradas ou sem disciplina: nenhuma matéria (sem card)", async () => {
      const { result } = setup([CLOSED], null);
      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.current).toBeNull();
      expect(result.current.options).toEqual([]);
    });
  });
});
