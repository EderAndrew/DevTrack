"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MY_CLASSES_PATH } from "@/lib/navigation";
import { ALL_YEARS, resolveYear, SEARCH_MAX, type YearChoice } from "../schemas/my-classes";

interface Chosen {
  /** The raw `ano` written to the address (`null`: the most recent year). */
  ano: string | null;
  busca: string;
}

/**
 * The year and the search of the 030 "Minhas turmas" (FR-010, research MT5): read from the address (`?ano=&busca=`,
 * `bem-vindo` kept from 003) and written back with `router.replace`. A choice is applied at once, before the address
 * catches up; a new address (reload, back, a link) wins over it. An absent, malformed or unknown `ano` is the most
 * recent year without rewriting the address. Only chooses what the browser shows: the list is the student's own.
 */
export function useMyClassesFilters(years: readonly number[]) {
  const params = useSearchParams();
  const router = useRouter();
  const addressKey = params.toString();
  const fromAddress: Chosen = { ano: params.get("ano"), busca: (params.get("busca") ?? "").slice(0, SEARCH_MAX) };
  const [applied, setApplied] = useState<(Chosen & { from: string }) | null>(null);
  const current = applied?.from === addressKey ? applied : fromAddress;
  const year = resolveYear(current.ano, years);
  // The `ano` that the address keeps: only one that `resolveYear` honoured.
  const keptAno = current.ano === ALL_YEARS || (year !== null && current.ano === String(year)) ? current.ano : null;

  const write = (next: Chosen) => {
    if (next.ano === keptAno && next.busca === current.busca) return;
    const out = new URLSearchParams();
    const welcome = params.get("bem-vindo");
    if (welcome !== null) out.set("bem-vindo", welcome);
    if (next.ano !== null) out.set("ano", next.ano);
    if (next.busca !== "") out.set("busca", next.busca);
    setApplied({ from: addressKey, ...next });
    const query = out.toString();
    router.replace(query ? `${MY_CLASSES_PATH}?${query}` : MY_CLASSES_PATH);
  };

  return {
    /** The chosen year, `todos`, or `null` while the student has no year. */
    year,
    /** The search as typed and applied (trimmed, ≤ 100). */
    search: current.busca,
    setYear: (choice: YearChoice) => write({ ano: String(choice), busca: current.busca }),
    setSearch: (text: string) => write({ ano: keptAno, busca: text.trim().slice(0, SEARCH_MAX) }),
    /** "Limpar busca e filtro": no search, the most recent year. */
    clear: () => write({ ano: null, busca: "" }),
  };
}
