/**
 * Class days are calendar dates without a time zone ("YYYY-MM-DD", 004 research E12). The day
 * picker works with local `Date`s at midnight, so conversions never go through UTC.
 */
const pad = (value: number) => String(value).padStart(2, "0");

export const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function fromIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

/** "18/03/2027". */
export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/** "Aula 05 — 18/03/2027" (004 contracts/web-ui.md). */
export const meetingLabel = (number: number, iso: string) => `Aula ${pad(number)} — ${formatIsoDate(iso)}`;
