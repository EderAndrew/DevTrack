import type {
  DayKind,
  StudentCalendar,
  StudentCalendarDay,
} from "@repo/contracts";

// 031 contracts/ui.md "Student" and research CK8: the week strip of "Seu calendário de aulas". Dates are calendar
// dates ("YYYY-MM-DD") with no time zone: arithmetic is done in UTC, never with the browser's clock or zone. "Today"
// comes from the server (CK7). Texts live in the web only.

export const CARD_TITLE = "Seu calendário de aulas";
export const PREVIOUS_WEEK = "Semana anterior";
export const NEXT_WEEK = "Próxima semana";
export const CHOOSE_A_DAY = "Escolha um dia para ver o que há nele.";
export const NOTHING_MARKED = "Nada marcado neste dia.";
export const NOT_PUBLISHED =
  "O professor ainda não publicou o calendário desta matéria.";
export const LOAD_FAILED = "Não foi possível carregar o calendário.";
export const RETRY = "Tentar novamente";
export const LOADING = "Carregando o calendário…";

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  CLASS: "Aula",
  EXAM: "Prova",
  ASSIGNMENT: "Trabalho",
  REVIEW: "Revisão",
  MAKEUP: "Reposição",
  HOLIDAY: "Feriado",
  RECESS: "Recesso",
  SPECIAL_EVENT: "Evento especial",
  TEACHER_ABSENCE: "Falta do professor",
};

/** The dot of each kind (CK9), from Design System tokens; the absence is hollow. Never the only signal. */
export const DOT_CLASSES: Record<DayKind, string> = {
  CLASS: "bg-primary",
  EXAM: "bg-danger",
  ASSIGNMENT: "bg-warning",
  REVIEW: "bg-info",
  MAKEUP: "bg-info",
  HOLIDAY: "bg-muted-foreground",
  RECESS: "bg-muted-foreground",
  SPECIAL_EVENT: "bg-success",
  TEACHER_ABSENCE: "border-2 border-danger-text bg-transparent",
};

const WEEKDAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const WEEKDAYS_LONG = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const MONTHS_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

const parse = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
};
const format = (date: Date) => date.toISOString().slice(0, 10);

export const addDays = (iso: string, days: number) =>
  format(new Date(parse(iso).getTime() + days * 86_400_000));

/** The Monday of the week of `iso`. */
export const weekStart = (iso: string) =>
  addDays(iso, -((parse(iso).getUTCDay() + 6) % 7));

/** The seven dates Monday–Sunday from `monday`. */
export const weekDays = (monday: string) =>
  Array.from({ length: 7 }, (_, index) => addDays(monday, index));

/** "16–22 nov", or "28 out–3 nov" across months. */
export function weekLabel(monday: string): string {
  const start = parse(monday);
  const end = parse(addDays(monday, 6));
  const startMonth = MONTHS_SHORT[start.getUTCMonth()];
  const endMonth = MONTHS_SHORT[end.getUTCMonth()];
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${endMonth}`
    : `${start.getUTCDate()} ${startMonth}–${end.getUTCDate()} ${endMonth}`;
}

/** "Novembro 2026": the month and year of the Monday. */
export function monthLabel(monday: string): string {
  const date = parse(monday);
  const month = MONTHS[date.getUTCMonth()]!;
  return `${month[0]!.toUpperCase()}${month.slice(1)} ${date.getUTCFullYear()}`;
}

/** "SEG" and the day number of a date. */
export const weekdayShort = (iso: string) =>
  WEEKDAYS_SHORT[parse(iso).getUTCDay()]!;
export const dayNumber = (iso: string) => parse(iso).getUTCDate();

/** "Segunda-feira, 16 de novembro". */
export function longDay(iso: string): string {
  const date = parse(iso);
  return `${WEEKDAYS_LONG[date.getUTCDay()]}, ${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]}`;
}

export interface Period {
  startsOn: string;
  endsOn: string;
}

/** The class period, or `null` when it has no dates (no week to show). */
export const periodOf = (calendar: StudentCalendar): Period | null =>
  calendar.class.startsOn && calendar.class.endsOn
    ? { startsOn: calendar.class.startsOn, endsOn: calendar.class.endsOn }
    : null;

/** The week of `monday`, kept between the week of the period's first day and the week of its last (031/FR-016). */
export function clampWeek(monday: string, period: Period): string {
  const first = weekStart(period.startsOn);
  const last = weekStart(period.endsOn);
  return monday < first ? first : monday > last ? last : monday;
}

export const canGoPrevious = (monday: string, period: Period) =>
  monday > weekStart(period.startsOn);
export const canGoNext = (monday: string, period: Period) =>
  monday < weekStart(period.endsOn);

export interface Selection {
  week: string;
  selected: string | null;
}

/**
 * Where the card opens (031/US3-2, FR-016): the week of today with today chosen; before the period, its first week;
 * after it, its last week — with the first marked day of that week chosen, or none. No period → no week.
 */
export function initialSelection(
  today: string,
  period: Period | null,
  days: readonly StudentCalendarDay[],
): Selection | null {
  if (!period) return null;
  if (today >= period.startsOn && today <= period.endsOn)
    return { week: weekStart(today), selected: today };
  const week =
    today < period.startsOn
      ? weekStart(period.startsOn)
      : weekStart(period.endsOn);
  const inWeek = new Set(weekDays(week));
  const firstMarked = days.find((day) => inWeek.has(day.date));
  return { week, selected: firstMarked?.date ?? null };
}

/** What the detail shows for a day (031/FR-017): the kind and the text, or `null` for a day with nothing marked. */
export function dayDetail(
  day: StudentCalendarDay | undefined,
): { label: string; text: string | null } | null {
  if (!day) return null;
  return {
    label: DAY_KIND_LABELS[day.kind],
    text: day.kind === "CLASS" ? null : day.text,
  };
}

/** "Segunda-feira, 16 de novembro, hoje: Aula" / "…: sem marcação". */
export function dayButtonName(
  iso: string,
  day: StudentCalendarDay | undefined,
  today: string,
): string {
  return `${longDay(iso)}${iso === today ? ", hoje" : ""}: ${day ? DAY_KIND_LABELS[day.kind] : "sem marcação"}`;
}

/** "<matéria> · Prof. <nome>". */
export const subjectLine = (calendar: StudentCalendar) =>
  `${calendar.class.subjectName} · Prof. ${calendar.class.teacherName}`;
