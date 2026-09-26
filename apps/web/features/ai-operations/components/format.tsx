import type { ReactNode } from "react";

const numbers = new Intl.NumberFormat("pt-BR");
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const seconds = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "—" read as "não informado" when the value is missing (006 contracts/web-ui.md). */
export function Missing() {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">não informado</span>
    </>
  );
}

export const count = (value: number | null): ReactNode => (value === null ? <Missing /> : numbers.format(value));

/** A count with its rate over `total` next to it, "7 (70%)"; only the count when `total` is 0 (007/FR-048). */
export const countWithRate = (value: number, total: number): ReactNode =>
  total === 0 ? numbers.format(value) : `${numbers.format(value)} (${percent.format(value / total)})`;

export const duration = (ms: number | null): ReactNode => (ms === null ? <Missing /> : `${seconds.format(ms / 1000)} s`);

export const cost = (amount: string | null, currency: string | null): ReactNode =>
  amount === null ? <Missing /> : `${currency ?? ""} ${Number(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`.trim();
