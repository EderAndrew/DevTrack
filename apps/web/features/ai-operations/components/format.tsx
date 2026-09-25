import type { ReactNode } from "react";

const numbers = new Intl.NumberFormat("pt-BR");
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

export const duration = (ms: number | null): ReactNode => (ms === null ? <Missing /> : `${seconds.format(ms / 1000)} s`);

export const cost = (amount: string | null, currency: string | null): ReactNode =>
  amount === null ? <Missing /> : `${currency ?? ""} ${Number(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`.trim();
