import type { CreateClassRequest } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";
import { optionalDate, refineCalendar } from "./class-form";

/** The search of ACTIVE turmas (027/FR-016): 1–100 characters, as the contract. */
export const CohortSearchFormSchema = z.strictObject({ q: z.string().trim().min(1).max(100) });
export type CohortSearchFormInput = z.input<typeof CohortSearchFormSchema>;
export const cohortSearchMessages = fieldMessages({ q: "Digite parte do nome ou do código da turma." });

/**
 * "Acrescentar disciplina a uma turma" (027/US3, contracts/ui.md): the chosen turma, an own active subject and an
 * optional calendar (004 rules).
 */
export const AddClassFormSchema = z
  .strictObject({
    cohortId: z.string().min(1, "Escolha a turma."),
    subjectId: z.string().min(1, "Escolha a disciplina."),
    startsOn: optionalDate,
    endsOn: optionalDate,
  })
  .superRefine(refineCalendar);
export type AddClassFormInput = z.input<typeof AddClassFormSchema>;
export type AddClassFormOutput = z.output<typeof AddClassFormSchema>;

export const toAddClassRequest = (values: AddClassFormOutput): CreateClassRequest => ({
  cohortId: values.cohortId,
  subjectId: values.subjectId,
  startsOn: values.startsOn || null,
  endsOn: values.endsOn || null,
});

/** API answers about the subject, shown next to the Disciplina select. */
export const SUBJECT_ERROR_CODES: readonly string[] = ["SUBJECT_INACTIVE", "CLASS_SUBJECT_DUPLICATE", "NOT_FOUND"];

/** FR-032 texts of this screen. */
export const ADD_CLASS_MESSAGES = {
  added: "Disciplina acrescentada à turma.",
  notFound: "Turma não encontrada. Peça ao gestor que a crie.",
  /** The turma was closed or archived between the search and the click (the 027 code is the MANAGER's text). */
  cohortNotActive: "Esta turma não está mais ativa. Pesquise e escolha outra.",
} as const;
