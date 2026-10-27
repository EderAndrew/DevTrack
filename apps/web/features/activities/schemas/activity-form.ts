import {
  ACTIVITY_INSTRUCTIONS_MAX,
  ACTIVITY_TITLE_MAX,
  AI_HELP_ALLOWANCE,
  type ActivitySource,
  type ActivityStatus,
  type ActivityType,
  ActivityTypeSchema,
  type CreateActivityRequest,
  EXAM_DURATION_MINUTES_MAX,
  EXAM_DURATION_MINUTES_MIN,
  EXAM_INACTIVITY_SECONDS_DEFAULT,
  EXAM_INACTIVITY_SECONDS_MAX,
  EXAM_INACTIVITY_SECONDS_MIN,
  EXAM_START_WINDOW_MINUTES_DEFAULT,
  EXAM_START_WINDOW_MINUTES_MAX,
  EXAM_START_WINDOW_MINUTES_MIN,
  type ExerciseDifficulty,
  GradeStringSchema,
  type HelpAvailability,
  type LatePolicy,
  LatePolicySchema,
  type PublicationPhase,
  type RosterStatus,
  type TeacherActivity,
  type TeacherActivitySummary,
  type UpdateActivityRequest,
  type WorkQuestionType,
} from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

// Labels of 012 contracts/web-ui.md (and 018's "Prova").
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = { ASSIGNMENT: "Trabalho", EXERCISE: "Exercício", EXAM: "Prova" };
export const LATE_POLICY_LABELS: Record<LatePolicy, string> = {
  REJECT: "Não aceitar",
  ACCEPT_MARKED: "Aceitar e marcar como atrasada",
};
export const QUESTION_TYPE_LABELS: Record<WorkQuestionType, string> = {
  OPEN_ANSWER: "Pergunta e resposta",
  MULTIPLE_CHOICE: "Múltipla escolha",
  CODE: "Código",
};
/**
 * The level of an exercise or of an exam's question as the banks name it (010, 018); kept here, since
 * activities never import the banks' features. The work and exam difficulties have the same values.
 */
export const DIFFICULTY_LABELS: Record<ExerciseDifficulty, string> = {
  BASIC: "Básico",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
};
export const ROSTER_STATUS_LABELS: Record<RosterStatus, string> = {
  NOT_STARTED: "Não iniciou",
  IN_PROGRESS: "Em andamento",
  SUBMITTED: "Entregou",
  SUBMITTED_LATE: "Entregou com atraso",
  MISSED: "Não entregou",
  COMPLETED: "Concluiu",
  ABSENT: "Ausente",
  // 018 contracts/web-ui.md, the exam monitor's badges.
  AWAITING_DECISION: "Encerrada por avisos — aguardando decisão",
  TIME_EXPIRED: "Tempo esgotado",
  CANCELLED: "Cancelada — nota zero",
  ENDED_BY_WARNINGS: "Encerrada por avisos — não cancelada",
  START_CLOSED: "Não iniciou (prazo para iniciar encerrado)",
};

// 015 contracts/web-ui.md: the work's options, "Como os alunos respondem".
export const WORK_OPTIONS_LEGEND = "Como os alunos respondem";
export const WORK_OPTION_TEXTS = {
  controlled: {
    label: "Modo controlado",
    description: "O aluno responde em tela cheia; saídas da tela e tentativas de copiar ou colar ficam registradas. Copiar e colar ficam bloqueados.",
  },
  aiHelp: {
    label: `Ajuda da IA (${AI_HELP_ALLOWANCE} perguntas por aluno)`,
    description: "A IA orienta sem dar a resposta. Você verá as perguntas e as orientações na correção.",
  },
} as const;
export const WORK_OPTIONS_LOCKED = "Não é possível mudar depois que um aluno iniciou.";

const HELP_UNAVAILABLE_REASONS: Record<NonNullable<HelpAvailability["reason"]>, string> = {
  AGENT_DISABLED: "o administrador ainda não ativou a ajuda da IA.",
  MODEL_UNAVAILABLE: "nenhum modelo de IA está disponível agora.",
};

/** While the availability is being checked, the help box waits disabled. */
export const HELP_CHECK_PENDING = "Verificando se a ajuda da IA está disponível…";

/** Why the AI help can't be turned on now (FR-004); null when it can. `undefined` = the check failed. */
export function helpUnavailableText(availability: HelpAvailability | undefined): string | null {
  if (availability?.available) return null;
  const reason = availability?.reason ? HELP_UNAVAILABLE_REASONS[availability.reason] : "não foi possível verificar agora.";
  return `A ajuda da IA está indisponível: ${reason}`;
}

// 018 contracts/web-ui.md, "Aplicar prova".
export const EXAM_APPLY_NOTICE = "A prova roda sempre em modo restrito, sem ajuda da IA e só para os alunos marcados presentes na chamada.";
export const EXAM_RESTRICTED_BADGE = "Modo restrito";
export const OUT_OF_TAUGHT_SCOPE = "Fora do escopo ensinado";

/** Only a Trabalho has a mode and an AI help (015/FR-002); an exam's are fixed by the server (018/FR-010). */
export const hasWorkOptions = (type: ActivityType) => type === "ASSIGNMENT";

/** A student started it: the mode and the AI help can't change any more (015/FR-005). */
export const activityStarted = (activity: TeacherActivity) => activity.roster.some((entry) => entry.attemptId !== null);

/** The options turned on, as text (015/FR-006): never only an icon or a color. */
export function workOptionBadges(activity: Pick<TeacherActivitySummary, "type" | "executionMode" | "aiHelp">): string[] {
  // An exam is always restricted and has no help (018/FR-010).
  if (activity.type === "EXAM") return [EXAM_RESTRICTED_BADGE];
  return [
    ...(activity.executionMode === "CONTROLLED" ? ["Modo controlado"] : []),
    ...(activity.aiHelp.allowance > 0 ? [`Ajuda da IA: ${activity.aiHelp.allowance} por aluno`] : []),
  ];
}

/** The teacher's situation of an activity: the phase while ACTIVE, else the status. */
export function activitySituation(status: ActivityStatus, phase: PublicationPhase | null): string {
  if (status === "CLOSED") return "Encerrada";
  if (status === "CANCELLED") return "Cancelada";
  return phase === "SCHEDULED" ? "Agendada" : "Publicada";
}

/** "0.34" → "0,34" (grades are shown with a comma). */
export const formatGrade = (grade: string) => grade.replace(".", ",");

/** Practice points as an integer, never a grade (013 K18): "1 ponto", "30 pontos". */
export const formatPoints = (points: number) => `${points} ${points === 1 ? "ponto" : "pontos"}`;

/** What the teacher typed ("0,5", "1.00") as the contract's grade string, or null when invalid. */
export function parseGradeInput(input: string): string | null {
  const grade = input.trim().replace(",", ".");
  return GradeStringSchema.safeParse(grade).success ? grade : null;
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

/** An exam's time fields (018/FR-007): whole numbers in their ranges, with their messages. */
const EXAM_RANGES = {
  durationMinutes: { min: EXAM_DURATION_MINUTES_MIN, max: EXAM_DURATION_MINUTES_MAX, message: "A duração vai de 1 a 120 minutos." },
  inactivityLimitSeconds: {
    min: EXAM_INACTIVITY_SECONDS_MIN,
    max: EXAM_INACTIVITY_SECONDS_MAX,
    message: "O limite de inatividade vai de 30 a 60 segundos.",
  },
  startWindowMinutes: {
    min: EXAM_START_WINDOW_MINUTES_MIN,
    max: EXAM_START_WINDOW_MINUTES_MAX,
    message: "O limite para iniciar vai de 0 a 60 minutos.",
  },
} as const;

/** What the teacher typed as a whole number, or null when it isn't one. */
const wholeNumber = (input: string): number | null => (/^\d+$/.test(input.trim()) ? Number.parseInt(input.trim(), 10) : null);

/**
 * Step 2 of "Nova atividade" (contracts/web-ui.md). `type` and `needsAcknowledgement` come from
 * step 1 and the scope check. A Trabalho has a deadline after the publication (now when "Publicar
 * agora") and a late policy; an Exercício has neither, nor a grade (013/FR-001); a Prova has its
 * duração, limite de inatividade and limite para iniciar instead (018/FR-007).
 */
export const ActivityFormSchema = z
  .object({
    type: ActivityTypeSchema,
    title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX),
    instructions: z.string().max(ACTIVITY_INSTRUCTIONS_MAX),
    publishMode: z.enum(["NOW", "SCHEDULE"]),
    publishAt: localDateTime,
    deadline: localDateTime,
    latePolicy: LatePolicySchema,
    needsAcknowledgement: z.boolean(),
    acknowledgeOutOfScope: z.boolean(),
    /** A Trabalho's options (015/FR-001): ignored for an Exercício. */
    controlled: z.boolean(),
    aiHelp: z.boolean(),
    /** A Prova's time (018/FR-007), as typed: checked only for an EXAM. */
    durationMinutes: z.string(),
    inactivityLimitSeconds: z.string(),
    startWindowMinutes: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "EXAM") {
      for (const key of Object.keys(EXAM_RANGES) as (keyof typeof EXAM_RANGES)[]) {
        const range = EXAM_RANGES[key];
        const value = wholeNumber(values[key]);
        if (value === null || value < range.min || value > range.max) ctx.addIssue({ code: "custom", path: [key], message: range.message });
      }
    }
    if (values.type === "ASSIGNMENT" && !values.deadline) {
      ctx.addIssue({ code: "custom", path: ["deadline"], message: "Informe o prazo de entrega." });
    }
    if (values.publishMode === "SCHEDULE" && !values.publishAt) {
      ctx.addIssue({ code: "custom", path: ["publishAt"], message: "Informe a data e a hora da publicação." });
    }
    const publication = values.publishMode === "SCHEDULE" && values.publishAt ? new Date(values.publishAt) : new Date();
    if (values.type === "ASSIGNMENT" && values.deadline && new Date(values.deadline).getTime() <= publication.getTime()) {
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

/** The defaults of a Prova's time fields (018/FR-007): no duration, 60 s and 15 min. */
export const EXAM_FIELD_DEFAULTS = {
  durationMinutes: "",
  inactivityLimitSeconds: String(EXAM_INACTIVITY_SECONDS_DEFAULT),
  startWindowMinutes: String(EXAM_START_WINDOW_MINUTES_DEFAULT),
} as const;

/**
 * The request by the source's type: a Trabalho with its deadline, late policy, mode and AI help
 * (015/FR-001), an Exercício without them, a Prova with its time and never a mode, help or
 * release mode (018/FR-010).
 */
export function toCreateActivityRequest(values: ActivityFormValues, source: ActivitySource, idempotencyKey: string): CreateActivityRequest {
  const common = {
    idempotencyKey,
    title: values.title.trim(),
    instructions: values.instructions.trim() || null,
    publishAt: values.publishMode === "SCHEDULE" ? localToIso(values.publishAt) : null,
    acknowledgeOutOfScope: values.acknowledgeOutOfScope,
  };
  if (source.type === "EXERCISE") return { ...common, source };
  if (source.type === "EXAM") {
    return {
      ...common,
      source,
      durationMinutes: wholeNumber(values.durationMinutes)!,
      inactivityLimitSeconds: wholeNumber(values.inactivityLimitSeconds)!,
      startWindowMinutes: wholeNumber(values.startWindowMinutes)!,
    };
  }
  return {
    ...common,
    source,
    deadline: localToIso(values.deadline),
    latePolicy: values.latePolicy,
    executionMode: values.controlled ? "CONTROLLED" : "NORMAL",
    // 021: "Permitir executar o código" arrives with the option's field (tasks T011); off until then.
    codeExecution: false,
    aiHelpAllowance: values.aiHelp ? AI_HELP_ALLOWANCE : 0,
  };
}

/**
 * The detail's edit form: the publication only while scheduled (`422 ALREADY_PUBLISHED` otherwise);
 * deadline, late policy, mode and AI help only for a Trabalho (an Exercício has none, 013/FR-004,
 * 015/FR-002), the last two only until a student starts (015/FR-005).
 */
export const ActivityEditSchema = z
  .object({
    title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX),
    instructions: z.string().max(ACTIVITY_INSTRUCTIONS_MAX),
    publishAt: localDateTime,
    hasDeadline: z.boolean(),
    deadline: localDateTime,
    latePolicy: LatePolicySchema,
    controlled: z.boolean(),
    aiHelp: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.hasDeadline && !values.deadline) ctx.addIssue({ code: "custom", path: ["deadline"], message: "Informe o prazo de entrega." });
    if (values.publishAt && values.deadline && new Date(values.deadline).getTime() <= new Date(values.publishAt).getTime()) {
      ctx.addIssue({ code: "custom", path: ["deadline"], message: SCHEDULE_MESSAGE });
    }
  });
export type ActivityEditValues = z.infer<typeof ActivityEditSchema>;

export const activityEditDefaults = (activity: TeacherActivity): ActivityEditValues => ({
  title: activity.title,
  instructions: activity.instructions ?? "",
  publishAt: isoToLocal(activity.publishAt),
  hasDeadline: activity.deadline !== null,
  deadline: activity.deadline ? isoToLocal(activity.deadline) : "",
  latePolicy: activity.latePolicy ?? "REJECT",
  controlled: activity.executionMode === "CONTROLLED",
  aiHelp: activity.aiHelp.allowance > 0,
});

/** Only what changed, with the version read; the publication only while scheduled. */
export function toUpdateActivityRequest(values: ActivityEditValues, activity: TeacherActivity): UpdateActivityRequest {
  const initial = activityEditDefaults(activity);
  return {
    version: activity.version,
    ...(values.title.trim() !== initial.title ? { title: values.title.trim() } : {}),
    ...(values.instructions !== initial.instructions ? { instructions: values.instructions.trim() || null } : {}),
    ...(activity.phase === "SCHEDULED" && values.publishAt !== initial.publishAt ? { publishAt: localToIso(values.publishAt) } : {}),
    ...(initial.hasDeadline && values.deadline !== initial.deadline ? { deadline: localToIso(values.deadline) } : {}),
    ...(initial.hasDeadline && values.latePolicy !== initial.latePolicy ? { latePolicy: values.latePolicy } : {}),
    ...(hasWorkOptions(activity.type) && values.controlled !== initial.controlled
      ? { executionMode: values.controlled ? "CONTROLLED" : "NORMAL" }
      : {}),
    ...(hasWorkOptions(activity.type) && values.aiHelp !== initial.aiHelp ? { aiHelpAllowance: values.aiHelp ? AI_HELP_ALLOWANCE : 0 } : {}),
  };
}
