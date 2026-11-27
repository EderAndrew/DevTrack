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
  type ExerciseDifficulty,
  GradeStringSchema,
  GroupSizeSchema,
  type HelpAvailability,
  type LatePolicy,
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
  // 021 contracts/web-ui.md.
  codeExecution: {
    label: "Permitir executar o código",
    description: "Os alunos poderão rodar o programa nos casos públicos das questões de Código. Os casos privados nunca são executados nem mostrados.",
  },
} as const;
/** 021/US2-6: the option stays available while the Code Runner is down. */
export const CODE_RUNNER_UNAVAILABLE = "A execução está indisponível agora; os alunos verão o botão quando ela voltar.";
export const CODE_EXECUTION_BADGE = "Execução de código: permitida";
export const WORK_OPTIONS_LOCKED = "Não é possível mudar depois que um aluno iniciou.";

// 023 contracts/web-ui.md: "Formato" of a work, Individual by default; "Em grupo" with a maximum of 2 to 5.
export const GROUP_FORMAT_TEXTS = {
  legend: "Formato",
  individual: "Individual",
  group: "Em grupo",
  size: "Máximo de integrantes, com o líder",
} as const;
export const GROUP_SIZE_OPTIONS = ["2", "3", "4", "5"] as const;
export const GROUP_SIZE_DEFAULT = "3";
export const GROUP_SIZE_MESSAGE = "Escolha de 2 a 5 integrantes, com o líder.";
export const groupBadge = (groupSize: number) => `Em grupo (até ${groupSize})`;

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

/** 023/FR-002: the format of an applied work changes only on a work that takes attendance (`422 GROUP_NEEDS_ATTENDANCE`). */
export const mayChooseGroup = (activity: Pick<TeacherActivity, "type" | "releaseMode">) =>
  hasWorkOptions(activity.type) && activity.releaseMode === "PRESENT_ONLY";

/** A student started it: the mode and the AI help can't change any more (015/FR-005). */
export const activityStarted = (activity: TeacherActivity) => activity.roster.some((entry) => entry.attemptId !== null);

/** The options turned on, as text (015/FR-006): never only an icon or a color. */
export function workOptionBadges(
  activity: Pick<TeacherActivitySummary, "type" | "executionMode" | "aiHelp" | "codeExecution" | "groupSize">,
): string[] {
  // An exam is always restricted and has no help (018/FR-010).
  if (activity.type === "EXAM") return [EXAM_RESTRICTED_BADGE];
  return [
    ...(activity.groupSize !== null ? [groupBadge(activity.groupSize)] : []),
    ...(activity.executionMode === "CONTROLLED" ? ["Modo controlado"] : []),
    ...(activity.aiHelp.allowance > 0 ? [`Ajuda da IA: ${activity.aiHelp.allowance} por aluno`] : []),
    ...(activity.codeExecution ? [CODE_EXECUTION_BADGE] : []),
  ];
}

/**
 * 021 (research Y2): an applied work whose snapshot has a CODE question with a PUBLIC case may offer
 * "Permitir executar o código" in its edit; whether its language runs is the server's (422 otherwise).
 */
export const mayAllowCodeExecution = (activity: TeacherActivity) =>
  hasWorkOptions(activity.type) &&
  activity.questions.some((question) => question.type === "CODE" && question.testCases.some((testCase) => testCase.visibility === "PUBLIC"));

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

const SCHEDULE_MESSAGE = "O término deve ser depois do início e, na prova, deixar pelo menos a duração.";
const EXTEND_ONLY_MESSAGE = "Depois de publicada, o término da prova só pode ser estendido.";

const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const clockTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * A work's or an exam's period in the browser's time zone (032 contracts/ui.md): "30/11, 19:10 → 22:00"
 * on one day, "30/11 19:10 → 01/12 08:00" across days.
 */
export function formatPeriod(startIso: string, endIso: string): string {
  const [start, end] = [new Date(startIso), new Date(endIso)];
  const [startDay, endDay] = [dayMonth.format(start), dayMonth.format(end)];
  if (startDay === endDay && end.getFullYear() === start.getFullYear()) return `${startDay}, ${clockTime.format(start)} → ${clockTime.format(end)}`;
  return `${startDay} ${clockTime.format(start)} → ${endDay} ${clockTime.format(end)}`;
}

/**
 * How the detail edits the end (032/FR-012, research AP5): a work's freely while ACTIVE (`FREE`), a scheduled
 * exam's with its start (`FREE`), a published exam's only later while it is ahead (`EXTEND`), else `NONE`.
 * The browser's clock only hides the field; the server decides (`409 ACTIVITY_PERIOD_ENDED`).
 */
export type EndEdit = "FREE" | "EXTEND" | "NONE";
export function endEditOf(activity: Pick<TeacherActivity, "type" | "status" | "phase" | "deadline">, now = new Date()): EndEdit {
  if (activity.status !== "ACTIVE" || activity.deadline === null) return "NONE";
  if (activity.type === "ASSIGNMENT" || activity.phase === "SCHEDULED") return "FREE";
  if (activity.type === "EXAM") return new Date(activity.deadline).getTime() >= now.getTime() ? "EXTEND" : "NONE";
  return "NONE";
}
const MINUTE_MS = 60_000;
const localDateTime = z.string().trim();

/** An exam's time fields (018/FR-007): whole numbers in their ranges, with their messages. */
const EXAM_RANGES = {
  durationMinutes: { min: EXAM_DURATION_MINUTES_MIN, max: EXAM_DURATION_MINUTES_MAX, message: "A duração vai de 1 a 120 minutos." },
  inactivityLimitSeconds: {
    min: EXAM_INACTIVITY_SECONDS_MIN,
    max: EXAM_INACTIVITY_SECONDS_MAX,
    message: "O limite de inatividade vai de 30 a 60 segundos.",
  },
} as const;

/** What the teacher typed as a whole number, or null when it isn't one. */
const wholeNumber = (input: string): number | null => (/^\d+$/.test(input.trim()) ? Number.parseInt(input.trim(), 10) : null);

/** 023: "Individual" or "Em grupo", the maximum as the select's value. */
const GroupFormatSchema = z.enum(["INDIVIDUAL", "GROUP"]);
export type GroupFormat = z.infer<typeof GroupFormatSchema>;

/** The format as the request's `groupSize` (023/FR-001): null for "Individual", the contract's 2–5 otherwise. */
const groupSizeOf = (values: { groupFormat: GroupFormat; groupSize: string }): number | null =>
  values.groupFormat === "GROUP" ? GroupSizeSchema.parse(wholeNumber(values.groupSize)) : null;

const checkGroupSize = (values: { groupFormat: GroupFormat; groupSize: string }, ctx: z.RefinementCtx) => {
  if (values.groupFormat === "GROUP" && !GroupSizeSchema.safeParse(wholeNumber(values.groupSize)).success) {
    ctx.addIssue({ code: "custom", path: ["groupSize"], message: GROUP_SIZE_MESSAGE });
  }
};

/** 032: the types applied for a period ("Período": início and término); an Exercício has a publication only. */
export const hasPeriod = (type: ActivityType) => type === "ASSIGNMENT" || type === "EXAM";

/** A `date` and a `time` input (the browser's time zone) as a `datetime-local` value. */
const joinLocal = (date: string, time: string) => `${date}T${time}`;

/** Today's date in the browser's time zone, as a `date` input value: "Término" starts on the start's day (032/FR-003). */
export const todayLocalDate = (now = new Date()) => isoToLocal(now.toISOString()).slice(0, 10);

export const PERIOD_TEXTS = {
  legend: "Período",
  start: "Início",
  now: "Agora",
  schedule: "Agendar",
  startDate: "Data do início",
  startTime: "Horário do início",
  endDate: "Data do término",
  endTime: "Horário do término",
  endHint: "Depois do término ninguém mais começa nem entrega.",
  durationHint: "De 1 a 120. Quem começar perto do término terá só o tempo que falta.",
} as const;

/**
 * Step 2 of "Nova atividade" (contracts/web-ui.md). `type` and `needsAcknowledgement` come from
 * step 1 and the scope check. A Trabalho and a Prova are applied for a period (032 contracts/ui.md):
 * the início now or a date and time, and the término's date (the início's by default) and time, after
 * the início, the Prova's at least its duration later (032/FR-002); no late policy since 032 (the server
 * stores `REJECT`). An Exercício has only the publication, no grade (013/FR-001); a Prova also has its
 * duração and limite de inatividade (018/FR-007).
 */
export const ActivityFormSchema = z
  .object({
    type: ActivityTypeSchema,
    title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX),
    instructions: z.string().max(ACTIVITY_INSTRUCTIONS_MAX),
    publishMode: z.enum(["NOW", "SCHEDULE"]),
    /** An Exercício's scheduled publication (`datetime-local`). */
    publishAt: localDateTime,
    /** 032 "Período" of a Trabalho or a Prova: the início's date and time when scheduled, the término's. */
    startDate: localDateTime,
    startTime: localDateTime,
    endDate: localDateTime,
    endTime: localDateTime,
    needsAcknowledgement: z.boolean(),
    acknowledgeOutOfScope: z.boolean(),
    /** A Trabalho's options (015/FR-001): ignored for an Exercício. */
    controlled: z.boolean(),
    aiHelp: z.boolean(),
    /** 021: offered only for a work with a runnable CODE question (`runnableCodeQuestionCount > 0`). */
    codeExecution: z.boolean(),
    /** 023: a Trabalho's format; ignored for an Exercício and a Prova. */
    groupFormat: GroupFormatSchema,
    groupSize: z.string(),
    /** A Prova's time (018/FR-007), as typed: checked only for an EXAM. */
    durationMinutes: z.string(),
    inactivityLimitSeconds: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "ASSIGNMENT") checkGroupSize(values, ctx);
    if (values.type === "EXAM") {
      for (const key of Object.keys(EXAM_RANGES) as (keyof typeof EXAM_RANGES)[]) {
        const range = EXAM_RANGES[key];
        const value = wholeNumber(values[key]);
        if (value === null || value < range.min || value > range.max) ctx.addIssue({ code: "custom", path: [key], message: range.message });
      }
    }
    if (hasPeriod(values.type)) checkPeriod(values, ctx);
    else if (values.publishMode === "SCHEDULE" && !values.publishAt) {
      ctx.addIssue({ code: "custom", path: ["publishAt"], message: "Informe a data e a hora da publicação." });
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

/** The período's fields, as the server checks them (032/FR-002): the término after the início, an exam's by its duration. */
function checkPeriod(
  values: Pick<ActivityFormValues, "type" | "publishMode" | "startDate" | "startTime" | "endDate" | "endTime" | "durationMinutes">,
  ctx: z.RefinementCtx,
) {
  const scheduled = values.publishMode === "SCHEDULE";
  if (scheduled && !values.startDate) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Informe a data do início." });
  if (scheduled && !values.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Informe o horário do início." });
  if (!values.endDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Informe a data do término." });
  if (!values.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Informe o término." });
  if (!values.endDate || !values.endTime || (scheduled && (!values.startDate || !values.startTime))) return;
  const start = scheduled ? new Date(joinLocal(values.startDate, values.startTime)) : new Date();
  const minimumMs = values.type === "EXAM" ? (wholeNumber(values.durationMinutes) ?? 0) * MINUTE_MS : 1;
  if (new Date(joinLocal(values.endDate, values.endTime)).getTime() - start.getTime() < minimumMs) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: SCHEDULE_MESSAGE });
  }
}

export const activityFormMessages = fieldMessages({
  title: "Informe o título da atividade.",
});

/** The defaults of a Prova's time fields (018/FR-007): no duration and 60 s. */
export const EXAM_FIELD_DEFAULTS = {
  durationMinutes: "",
  inactivityLimitSeconds: String(EXAM_INACTIVITY_SECONDS_DEFAULT),
} as const;

/**
 * The request by the source's type: a Trabalho with its period's end, mode and AI help (015/FR-001),
 * an Exercício without them, a Prova with its period's end and time and never a mode, help or release
 * mode (018/FR-010). No late policy since 032.
 */
export function toCreateActivityRequest(values: ActivityFormValues, source: ActivitySource, idempotencyKey: string): CreateActivityRequest {
  const scheduled = values.publishMode === "SCHEDULE";
  const common = {
    idempotencyKey,
    title: values.title.trim(),
    instructions: values.instructions.trim() || null,
    acknowledgeOutOfScope: values.acknowledgeOutOfScope,
  };
  if (source.type === "EXERCISE") return { ...common, publishAt: scheduled ? localToIso(values.publishAt) : null, source };
  const period = {
    publishAt: scheduled ? localToIso(joinLocal(values.startDate, values.startTime)) : null,
    deadline: localToIso(joinLocal(values.endDate, values.endTime)),
  };
  if (source.type === "EXAM") {
    return {
      ...common,
      ...period,
      source,
      durationMinutes: wholeNumber(values.durationMinutes)!,
      inactivityLimitSeconds: wholeNumber(values.inactivityLimitSeconds)!,
    };
  }
  return {
    ...common,
    ...period,
    source,
    executionMode: values.controlled ? "CONTROLLED" : "NORMAL",
    codeExecution: values.codeExecution,
    aiHelpAllowance: values.aiHelp ? AI_HELP_ALLOWANCE : 0,
    groupSize: groupSizeOf(values),
  };
}

/**
 * The detail's edit form: the publication only while scheduled (`422 ALREADY_PUBLISHED` otherwise);
 * deadline, mode and AI help only for a Trabalho (an Exercício has none, 013/FR-004, 015/FR-002), the
 * last two only until a student starts (015/FR-005). The late policy is read only since 032; an exam's
 * end is edited with the 032 rules (US1).
 */
export const ActivityEditSchema = z
  .object({
    title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX),
    instructions: z.string().max(ACTIVITY_INSTRUCTIONS_MAX),
    publishAt: localDateTime,
    hasDeadline: z.boolean(),
    deadline: localDateTime,
    /** 032: a published exam's current end (only later), or "" when the end moves freely. */
    minDeadline: localDateTime,
    /** 032: an exam's duration, so its period holds it (0 for a work). */
    durationMinutes: z.number(),
    controlled: z.boolean(),
    aiHelp: z.boolean(),
    codeExecution: z.boolean(),
    groupFormat: GroupFormatSchema,
    groupSize: z.string(),
  })
  .superRefine((values, ctx) => {
    checkGroupSize(values, ctx);
    if (values.hasDeadline && !values.deadline) ctx.addIssue({ code: "custom", path: ["deadline"], message: "Informe o término." });
    if (!values.hasDeadline || !values.deadline) return;
    if (values.minDeadline && new Date(values.deadline).getTime() < new Date(values.minDeadline).getTime()) {
      ctx.addIssue({ code: "custom", path: ["deadline"], message: EXTEND_ONLY_MESSAGE });
    } else if (values.publishAt && new Date(values.deadline).getTime() - new Date(values.publishAt).getTime() < Math.max(1, values.durationMinutes * MINUTE_MS)) {
      ctx.addIssue({ code: "custom", path: ["deadline"], message: SCHEDULE_MESSAGE });
    }
  });
export type ActivityEditValues = z.infer<typeof ActivityEditSchema>;

export const activityEditDefaults = (activity: TeacherActivity, now = new Date()): ActivityEditValues => {
  const endEdit = endEditOf(activity, now);
  return {
    title: activity.title,
    instructions: activity.instructions ?? "",
    publishAt: isoToLocal(activity.publishAt),
    // 032: a work's end, a scheduled exam's, and a published exam's only later ("Estender término").
    hasDeadline: endEdit !== "NONE",
    deadline: endEdit !== "NONE" && activity.deadline ? isoToLocal(activity.deadline) : "",
    minDeadline: endEdit === "EXTEND" && activity.deadline ? isoToLocal(activity.deadline) : "",
    durationMinutes: activity.exam?.durationMinutes ?? 0,
    controlled: activity.executionMode === "CONTROLLED",
    aiHelp: activity.aiHelp.allowance > 0,
    codeExecution: activity.codeExecution,
    groupFormat: activity.groupSize === null ? "INDIVIDUAL" : "GROUP",
    groupSize: activity.groupSize === null ? GROUP_SIZE_DEFAULT : String(activity.groupSize),
  };
};

/** Only what changed, with the version read; the publication only while scheduled. */
export function toUpdateActivityRequest(values: ActivityEditValues, activity: TeacherActivity): UpdateActivityRequest {
  const initial = activityEditDefaults(activity);
  return {
    version: activity.version,
    ...(values.title.trim() !== initial.title ? { title: values.title.trim() } : {}),
    ...(values.instructions !== initial.instructions ? { instructions: values.instructions.trim() || null } : {}),
    ...(activity.phase === "SCHEDULED" && values.publishAt !== initial.publishAt ? { publishAt: localToIso(values.publishAt) } : {}),
    ...(initial.hasDeadline && values.deadline !== initial.deadline ? { deadline: localToIso(values.deadline) } : {}),
    ...(hasWorkOptions(activity.type) && values.controlled !== initial.controlled
      ? { executionMode: values.controlled ? "CONTROLLED" : "NORMAL" }
      : {}),
    ...(hasWorkOptions(activity.type) && values.aiHelp !== initial.aiHelp ? { aiHelpAllowance: values.aiHelp ? AI_HELP_ALLOWANCE : 0 } : {}),
    ...(hasWorkOptions(activity.type) && values.codeExecution !== initial.codeExecution ? { codeExecution: values.codeExecution } : {}),
    ...(hasWorkOptions(activity.type) && groupSizeOf(values) !== activity.groupSize ? { groupSize: groupSizeOf(values) } : {}),
  };
}
