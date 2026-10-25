const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** ISO date of the contract (002 S4) as shown on every screen: short date and time in Brasília. */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

const isoDay = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** Today as a calendar date of the contract ("YYYY-MM-DD") in Brasília, like the API's planning date. */
export const todayIsoDate = (now: Date = new Date()) => isoDay.format(now);

const calendarDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });

/** A calendar date of the contract ("YYYY-MM-DD", no time zone) as "dd/mm/aaaa". */
export const formatDate = (isoDate: string) => calendarDate.format(new Date(`${isoDate}T00:00:00Z`));

const mediumDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" });

/** The day of an instant of the contract in Brasília, "25 de out. de 2026" (020 "Meus feedbacks"). */
export const formatMediumDate = (iso: string) => mediumDate.format(new Date(iso));

const longDay = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * An instant of the contract written out in the browser's time zone (012 contracts/web-ui.md):
 * "sexta-feira, 10 de outubro, 23:59".
 */
export const formatLongDateTime = (iso: string) => {
  const date = new Date(iso);
  return `${longDay.format(date)}, ${clock.format(date)}`;
};

/** The time of an instant in the browser's time zone, "14:32" (015 Exam Mode warnings). */
export const formatTime = (iso: string) => clock.format(new Date(iso));
