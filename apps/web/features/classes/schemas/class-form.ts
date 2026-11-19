import { IsoDateSchema } from "@repo/contracts";
import { z } from "zod";

/** A date field: empty, or a calendar date of the contract. */
export const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || IsoDateSchema.safeParse(value).success);

/**
 * Both dates or neither, the end not before the start (004/US1-5), with the error on the field to fix. Shared by
 * the add form and the calendar edit.
 */
export function refineCalendar({ startsOn, endsOn }: { startsOn: string; endsOn: string }, ctx: z.RefinementCtx): void {
  if (Boolean(startsOn) !== Boolean(endsOn)) {
    ctx.addIssue({
      code: "custom",
      path: [startsOn ? "endsOn" : "startsOn"],
      message: "Informe as datas de início e de término, ou deixe as duas em branco.",
    });
  } else if (startsOn && endsOn && endsOn < startsOn) {
    ctx.addIssue({ code: "custom", path: ["endsOn"], message: "A data de término não pode ser anterior à de início." });
  }
}

/**
 * The calendar of a disciplina da turma (004 rules; 027/FR-019: the teacher edits only the dates — the turma is the
 * MANAGER's and the subject never changes). Blank dates are sent as null.
 */
export const ClassFormSchema = z.strictObject({ startsOn: optionalDate, endsOn: optionalDate }).superRefine(refineCalendar);
export type ClassFormInput = z.input<typeof ClassFormSchema>;
export type ClassFormOutput = z.output<typeof ClassFormSchema>;

export const toCalendarRequest = (values: ClassFormOutput) => ({
  startsOn: values.startsOn || null,
  endsOn: values.endsOn || null,
});
