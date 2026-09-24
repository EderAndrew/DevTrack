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
