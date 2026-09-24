/** Time zone of "today" for the class plan: a meeting can be completed from its date on (004/US9, E23). */
export const PLANNING_TIME_ZONE = "America/Sao_Paulo";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLANNING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" of `now` in PLANNING_TIME_ZONE. */
export const planningToday = (now: Date = new Date()): string => dayFormat.format(now);
