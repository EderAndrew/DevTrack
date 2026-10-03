import {
  ACTIVITY_INSTRUCTIONS_MAX,
  ACTIVITY_TITLE_MAX,
  type ActivitySource,
  type ActivityStatus,
  type ActivityType,
  ActivityTypeSchema,
  type CreateActivityRequest,
  centsToGrade,
  distributeGrade,
  GradeStringSchema,
  gradeToCents,
  type LatePolicy,
  LatePolicySchema,
  type PublicationPhase,
  type RosterStatus,
  type TeacherActivity,
  type UpdateActivityRequest,
  type WorkQuestionType,
} from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

// Labels of 012 contracts/web-ui.md.
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = { ASSIGNMENT: "Trabalho", EXERCISE: "Exercício" };
export const LATE_POLICY_LABELS: Record<LatePolicy, string> = {
  REJECT: "Não aceitar",
  ACCEPT_MARKED: "Aceitar e marcar como atrasada",
};
export const QUESTION_TYPE_LABELS: Record<WorkQuestionType, string> = {
  OPEN_ANSWER: "Pergunta e resposta",
  MULTIPLE_CHOICE: "Múltipla escolha",
  CODE: "Código",
};
export const ROSTER_STATUS_LABELS: Record<RosterStatus, string> = {
  NOT_STARTED: "Não iniciou",
  IN_PROGRESS: "Em andamento",
  SUBMITTED: "Entregou",
  SUBMITTED_LATE: "Entregou com atraso",
  MISSED: "Não entregou",
  COMPLETED: "Concluiu",
};

/** The teacher's situation of an activity: the phase while ACTIVE, else the status. */
export function activitySituation(status: ActivityStatus, phase: PublicationPhase | null): string {
  if (status === "CLOSED") return "Encerrada";
  if (status === "CANCELLED") return "Cancelada";
  return phase === "SCHEDULED" ? "Agendada" : "Publicada";
}

/** "0.34" → "0,34" (grades are shown with a comma). */
export const formatGrade = (grade: string) => grade.replace(".", ",");

/** What the teacher typed ("0,5", "1.00") as the contract's grade string, or null when invalid. */
export function parseGradeInput(input: string): string | null {
  const grade = input.trim().replace(",", ".");
  return GradeStringSchema.safeParse(grade).success ? grade : null;
}

/** Each question's value of an Exercise, by position (the 011 rule the API applies), or null. */
export function previewValues(totalGradeInput: string, count: number): string[] | null {
  const grade = parseGradeInput(totalGradeInput);
  if (grade === null || count === 0 || gradeToCents(grade) < count) return null;
  return distributeGrade(gradeToCents(grade), count).map((cents) => formatGrade(centsToGrade(cents)));
}

/** A `datetime-local` value (the browser's time zone) as the contract's instant. */
export const localToIso = (value: string) => new Date(value).toISOString();

/** An instant of the contract as a `datetime-local` value in the browser's time zone. */
export function isoToLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const SCHEDULE_MESSAGE = "O prazo deve ser depois da data de publicação.";
const localDateTime = z.string().trim();

/**
 * Step 2 of "Nova atividade" (contracts/web-ui.md). `type` and `needsAcknowledgement` come from
 * step 1 and the scope check; the total grade is the teacher's only for an Exercício (Q3 = A) and
 * accepts a comma; the deadline comes after the publication (now when "Publicar agora").
 */
export const ActivityFormSchema = z
  .object({
    type: ActivityTypeSchema,
    title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX),
    instructions: z.string().max(ACTIVITY_INSTRUCTIONS_MAX),
    totalGrade: z.string(),
    publishMode: z.enum(["NOW", "SCHEDULE"]),
    publishAt: localDateTime,
    deadline: localDateTime.min(1),
    latePolicy: LatePolicySchema,
    needsAcknowledgement: z.boolean(),
    acknowledgeOutOfScope: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "EXERCISE" && parseGradeInput(values.totalGrade) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["totalGrade"],
        message: values.totalGrade.trim() ? "Informe uma nota entre 0,01 e 100,00, com até duas casas." : "Informe a nota total.",
      });
    }
    if (values.publishMode === "SCHEDULE" && !values.publishAt) {
      ctx.addIssue({ code: "custom", path: ["publishAt"], message: "Informe a data e a hora da publicação." });
    }
    const publication = values.publishMode === "SCHEDULE" && values.publishAt ? new Date(values.publishAt) : new Date();
    if (values.deadline && new Date(values.deadline).getTime() <= publication.getTime()) {
      ctx.addIssue({ code: "custom", path: ["deadline"], message: SCHEDULE_MESSAGE });
    }
    if (values.needsAcknowledgement && !values.acknowledgeOutOfScope) {
      ctx.addIssue({
        code: "custom",
        path: ["acknowledgeOutOfScope"],
        message: "Confirme a aplicação com tópicos ainda não concluídos.",
      });
    }
  });
export type ActivityFormValues = z.infer<typeof ActivityFormSchema>;

export const activityFormMessages = fieldMessages({
  title: "Informe o título da atividade.",
  deadline: "Informe o prazo de entrega.",
});

export function toCreateActivityRequest(values: ActivityFormValues, source: ActivitySource, idempotencyKey: string): CreateActivityRequest {
  return {
    idempotencyKey,
    source,
    title: values.title.trim(),
    instructions: values.instructions.trim() || null,
    ...(values.type === "EXERCISE" ? { totalGrade: parseGradeInput(values.totalGrade)! } : {}),
    publishAt: values.publishMode === "SCHEDULE" ? localToIso(values.publishAt) : null,
    deadline: localToIso(values.deadline),
    latePolicy: values.latePolicy,
    acknowledgeOutOfScope: values.acknowledgeOutOfScope,
  };
}

/** The detail's edit form: the publication only while scheduled (`422 ALREADY_PUBLISHED` otherwise). */
export const ActivityEditSchema = z
  .object({
    title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX),
    instructions: z.string().max(ACTIVITY_INSTRUCTIONS_MAX),
    publishAt: localDateTime,
    deadline: localDateTime.min(1),
    latePolicy: LatePolicySchema,
  })
  .superRefine((values, ctx) => {
    if (values.publishAt && values.deadline && new Date(values.deadline).getTime() <= new Date(values.publishAt).getTime()) {
      ctx.addIssue({ code: "custom", path: ["deadline"], message: SCHEDULE_MESSAGE });
    }
  });
export type ActivityEditValues = z.infer<typeof ActivityEditSchema>;

export const activityEditDefaults = (activity: TeacherActivity): ActivityEditValues => ({
  title: activity.title,
  instructions: activity.instructions ?? "",
  publishAt: isoToLocal(activity.publishAt),
  deadline: isoToLocal(activity.deadline),
  latePolicy: activity.latePolicy,
});

/** Only what changed, with the version read; the publication only while scheduled. */
export function toUpdateActivityRequest(values: ActivityEditValues, activity: TeacherActivity): UpdateActivityRequest {
  const initial = activityEditDefaults(activity);
  return {
    version: activity.version,
    ...(values.title.trim() !== initial.title ? { title: values.title.trim() } : {}),
    ...(values.instructions !== initial.instructions ? { instructions: values.instructions.trim() || null } : {}),
    ...(activity.phase === "SCHEDULED" && values.publishAt !== initial.publishAt ? { publishAt: localToIso(values.publishAt) } : {}),
    ...(values.deadline !== initial.deadline ? { deadline: localToIso(values.deadline) } : {}),
    ...(values.latePolicy !== initial.latePolicy ? { latePolicy: values.latePolicy } : {}),
  };
}
