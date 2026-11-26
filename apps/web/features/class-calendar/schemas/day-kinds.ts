import {
  type CalendarDayInput,
  type ClassMeetingList,
  type DayKind,
  DayKindSchema,
  MAX_ABSENCE_NOTICE_LENGTH,
  MAX_ABSENCE_REASON_LENGTH,
  MAX_DAY_DESCRIPTION_LENGTH,
  type UpdateClassMeetingsBody,
} from "@repo/contracts";
import { z } from "zod";

// 031 contracts/ui.md "Kinds" and research CK9/CK10: the words of the nine kinds, the dot of each, and how the
// editor's pending marks become the save's `add`/`set`/`remove`. Texts live only in the web.

export const DAY_KINDS = DayKindSchema.options;

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

/** The hint of the "Descrição" field; CLASS has no field and TEACHER_ABSENCE has its own two. */
export const DAY_KIND_HINTS: Record<
  Exclude<DayKind, "CLASS" | "TEACHER_ABSENCE">,
  string
> = {
  EXAM: "Qual prova? Ex.: P1 — Herança",
  ASSIGNMENT: "Entrega ou apresentação de qual trabalho?",
  REVIEW: "Revisão de quê?",
  MAKEUP: "Reposição de qual aula?",
  HOLIDAY: "Qual feriado?",
  RECESS: "Qual recesso?",
  SPECIAL_EVENT: "Qual evento? Ex.: palestra, workshop",
};

export const MARK_DAY_TITLE = "Marcar dia";
export const DESCRIPTION_LABEL = "Descrição";
export const REASON_LABEL = "Motivo (só você vê)";
export const NOTICE_LABEL = "Aviso para a turma (opcional)";
export const ABSENCE_NOTE =
  "Os alunos veem “Falta do professor” e o aviso, nunca o motivo.";
export const KIND_LEGEND = "Tipo do dia";
export const CONFIRM = "Confirmar";
export const UNMARK_DAY = "Desmarcar dia";
export const LEGEND_TITLE = "Legenda";
export const NO_CLASS_DAYS_TITLE = "Dias sem aula";

const MEETING_KINDS: ReadonlySet<DayKind> = new Set<DayKind>([
  "CLASS",
  "EXAM",
  "ASSIGNMENT",
  "REVIEW",
  "MAKEUP",
]);

/** Aula, Prova, Trabalho, Revisão e Reposição are encontros: numbered, counted, take topics (031/FR-002). */
export const isMeetingKind = (kind: DayKind) => MEETING_KINDS.has(kind);

export const hasDescription = (kind: DayKind) =>
  kind !== "CLASS" && kind !== "TEACHER_ABSENCE";

/**
 * The dot of each kind (CK9), from Design System tokens; TEACHER_ABSENCE is hollow. Color is never the only signal:
 * each day also has its kind in words.
 */
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

/** The token of each dot, checked against `card` by `test/contrast.test.ts`. */
export const dotToken = (kind: DayKind) =>
  kind === "TEACHER_ABSENCE"
    ? "danger-text"
    : DOT_CLASSES[kind].replace(/^bg-/, "");

/** A marked day as the editor keeps it: the kind and only the texts that kind has. */
export interface DayMark {
  kind: DayKind;
  description: string | null;
  absenceReason: string | null;
  absenceNotice: string | null;
}

/** The saved marks of the class by "YYYY-MM-DD" (meetings and days without class). */
export function marksOf(list: ClassMeetingList): Map<string, DayMark> {
  const marks = new Map<string, DayMark>();
  for (const meeting of list.items) {
    marks.set(meeting.date, {
      kind: meeting.kind,
      description: meeting.description,
      absenceReason: null,
      absenceNotice: null,
    });
  }
  for (const day of list.days) {
    marks.set(day.date, {
      kind: day.kind,
      description: day.description,
      absenceReason: day.absenceReason,
      absenceNotice: day.absenceNotice,
    });
  }
  return marks;
}

const sameMark = (a: DayMark, b: DayMark) =>
  a.kind === b.kind &&
  a.description === b.description &&
  a.absenceReason === b.absenceReason &&
  a.absenceNotice === b.absenceNotice;

/** The `set` entry of a mark (the contract's discriminated union). */
export function toDayInput(date: string, mark: DayMark): CalendarDayInput {
  if (mark.kind === "CLASS") return { date, kind: "CLASS" };
  if (mark.kind === "TEACHER_ABSENCE") {
    return {
      date,
      kind: "TEACHER_ABSENCE",
      absenceReason: mark.absenceReason ?? "",
      absenceNotice: mark.absenceNotice,
    };
  }
  return { date, kind: mark.kind, description: mark.description ?? "" };
}

/**
 * The smallest save for the pending marks (CK10): a new day marked Aula → `add` (as in 004); a new day of another kind,
 * or a day whose kind or text changed → `set`; a saved day no longer marked → `remove`; an unchanged day → nothing.
 */
export function pendingToRequest(
  saved: ReadonlyMap<string, DayMark>,
  pending: ReadonlyMap<string, DayMark>,
): Pick<UpdateClassMeetingsBody, "add" | "set" | "remove"> {
  const add: string[] = [];
  const set: CalendarDayInput[] = [];
  for (const date of [...pending.keys()].sort()) {
    const mark = pending.get(date)!;
    const before = saved.get(date);
    if (!before && mark.kind === "CLASS") add.push(date);
    else if (!before || !sameMark(before, mark))
      set.push(toDayInput(date, mark));
  }
  const remove = [...saved.keys()].filter((date) => !pending.has(date)).sort();
  return { add, set, remove };
}

/** "Total de aulas selecionadas": the encontros among the marks. */
export const meetingCount = (marks: ReadonlyMap<string, DayMark>) =>
  [...marks.values()].filter((mark) => isMeetingKind(mark.kind)).length;

/** The number of each encontro in date order (004/FR-027); other kinds have none. */
export function meetingNumbers(
  marks: ReadonlyMap<string, DayMark>,
): Map<string, number> {
  const dates = [...marks.keys()]
    .filter((date) => isMeetingKind(marks.get(date)!.kind))
    .sort();
  return new Map(dates.map((date, index) => [date, index + 1]));
}

/** "37 de 120": the characters as the teacher sees them (code points, after trimming the ends). */
export const counterLabel = (value: string, max: number) =>
  `${[...value.trim()].length} de ${max}`;

// The modal's form: the contract's limits with the teacher's words.

const text = (max: number, empty: string, tooLong: string) =>
  z
    .string()
    .trim()
    .refine((value) => value.length > 0, empty)
    .refine((value) => [...value].length <= max, tooLong)
    .refine(
      (value) => !value.includes("\u0000"),
      "Remova os caracteres inválidos.",
    );

const descriptionSchema = text(
  MAX_DAY_DESCRIPTION_LENGTH,
  "Escreva a descrição.",
  `Use até ${MAX_DAY_DESCRIPTION_LENGTH} caracteres.`,
);
const reasonSchema = text(
  MAX_ABSENCE_REASON_LENGTH,
  "Escreva o motivo.",
  `Use até ${MAX_ABSENCE_REASON_LENGTH} caracteres.`,
);
const noticeSchema = z
  .string()
  .trim()
  .refine(
    (value) => [...value].length <= MAX_ABSENCE_NOTICE_LENGTH,
    `Use até ${MAX_ABSENCE_NOTICE_LENGTH} caracteres.`,
  )
  .refine(
    (value) => !value.includes("\u0000"),
    "Remova os caracteres inválidos.",
  );

export interface DayKindFormInput {
  kind: DayKind;
  description: string;
  absenceReason: string;
  absenceNotice: string;
}

/** Validates only the fields of the chosen kind and drops the others (031/FR-006). */
export const DayKindFormSchema = z
  .object({
    kind: DayKindSchema,
    description: z.string(),
    absenceReason: z.string(),
    absenceNotice: z.string(),
  })
  .transform((values, ctx): DayMark => {
    const check = <T>(
      schema: z.ZodType<T>,
      value: string,
      path: keyof DayKindFormInput,
    ) => {
      const result = schema.safeParse(value);
      if (!result.success) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: result.error.issues[0]!.message,
        });
        return null;
      }
      return result.data;
    };
    if (values.kind === "CLASS")
      return {
        kind: "CLASS",
        description: null,
        absenceReason: null,
        absenceNotice: null,
      };
    if (values.kind === "TEACHER_ABSENCE") {
      const absenceReason = check(
        reasonSchema,
        values.absenceReason,
        "absenceReason",
      );
      const absenceNotice = check(
        noticeSchema,
        values.absenceNotice,
        "absenceNotice",
      );
      return {
        kind: "TEACHER_ABSENCE",
        description: null,
        absenceReason,
        absenceNotice: absenceNotice || null,
      };
    }
    return {
      kind: values.kind,
      description: check(descriptionSchema, values.description, "description"),
      absenceReason: null,
      absenceNotice: null,
    };
  });

/** The form's starting values: Aula on an unmarked day (031/FR-003), the current kind and texts on a marked one. */
export const formValuesOf = (mark: DayMark | null): DayKindFormInput => ({
  kind: mark?.kind ?? "CLASS",
  description: mark?.description ?? "",
  absenceReason: mark?.absenceReason ?? "",
  absenceNotice: mark?.absenceNotice ?? "",
});

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
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

/** "segunda-feira, 16 de novembro de 2026" (a calendar date: no time zone involved). */
export function longDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${day} de ${MONTHS[month! - 1]} de ${year}`;
}

/** The kind of a day in its accessible name: "Prova — aula 12", "Feriado". */
export const dayKindName = (kind: DayKind, number?: number) =>
  number ? `${DAY_KIND_LABELS[kind]} — aula ${number}` : DAY_KIND_LABELS[kind];
