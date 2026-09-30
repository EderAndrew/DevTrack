import {
  type WorkDifficulty,
  type WorkGenerationRequest,
  WorkGenerationRequestSchema,
  type WorkGenerationRequestView,
  type WorkQuestionType,
  type WorkQuestionTypeCounts,
  WorkQuestionTypeSchema,
  workGenerationCounts,
} from "@repo/contracts";
import { z } from "zod";
import { INVALID_DATA } from "@/lib/forms/field-messages";
import {
  BELOW_MINIMUM_MESSAGE,
  GRADE_FORMAT_MESSAGE,
  gradeInput,
} from "./work-form";

/**
 * "Criar trabalho com IA" (011 contracts/web-ui.md): Disciplina → Ementa → Tópicos (1–10), the
 * work's title, description, difficulty and total grade, the total, the types and their
 * distribution, and the trick questions. The language is not a field: it comes from the syllabus
 * (FR-018).
 */
export interface WorkGenerationFormValues {
  subjectId: string;
  revisionId: string;
  /** In the order they were checked. */
  syllabusItemIds: string[];
  title: string;
  description: string;
  difficulty: WorkDifficulty | "";
  /** As typed, with a comma or a dot ("2,00"). */
  totalGrade: string;
  total: string;
  types: WorkQuestionType[];
  distributionMode: "AUTO" | "MANUAL";
  counts: Record<WorkQuestionType, string>;
  trickQuestions: string;
}

export const emptyWorkGenerationForm = (): WorkGenerationFormValues => ({
  subjectId: "",
  revisionId: "",
  syllabusItemIds: [],
  title: "",
  description: "",
  difficulty: "",
  totalGrade: "",
  total: "5",
  types: ["OPEN_ANSWER", "MULTIPLE_CHOICE"],
  distributionMode: "AUTO",
  counts: { OPEN_ANSWER: "", MULTIPLE_CHOICE: "", CODE: "" },
  trickQuestions: "0",
});

const asInt = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

/** The contract's request for the form's values; incomplete values are the contract's to refuse. */
export function toWorkGenerationRequest(
  values: WorkGenerationFormValues,
  idempotencyKey: string,
): WorkGenerationRequest {
  const types = Array.isArray(values.types) ? values.types : [];
  const description = values.description.trim();
  return {
    subjectId: values.subjectId || undefined,
    syllabusRevisionId: values.revisionId || undefined,
    syllabusItemIds: values.syllabusItemIds,
    title: values.title,
    ...(description === "" ? {} : { description }),
    difficulty: values.difficulty || undefined,
    totalGrade: gradeInput(values.totalGrade),
    total: asInt(values.total),
    types,
    distribution:
      values.distributionMode === "AUTO"
        ? { mode: "AUTO" }
        : {
            mode: "MANUAL",
            counts: Object.fromEntries(
              types.map((type) => [type, asInt(values.counts[type])]),
            ),
          },
    trickQuestions: types.includes("MULTIPLE_CHOICE")
      ? (asInt(values.trickQuestions) ?? 0)
      : 0,
    idempotencyKey,
  } as WorkGenerationRequest;
}

/** The counts per type now: the preview of the server's automatic distribution, or the manual ones. */
export function previewWorkCounts(
  values: WorkGenerationFormValues,
): WorkQuestionTypeCounts {
  const types = Array.isArray(values.types) ? values.types : [];
  const total = asInt(values.total) ?? 0;
  if (values.distributionMode === "AUTO")
    return workGenerationCounts({ total, types, distribution: { mode: "AUTO" } });
  return Object.fromEntries(
    WorkQuestionTypeSchema.options.map((type) => [
      type,
      types.includes(type) ? (asInt(values.counts[type]) ?? 0) : 0,
    ]),
  ) as WorkQuestionTypeCounts;
}

/**
 * "Pedir de novo" / "Tentar de novo" (011/FR-032): the same configuration as `view`, a new key,
 * and the link to the request it repeats.
 */
export function regenerationRequest(
  view: WorkGenerationRequestView,
  idempotencyKey: string,
): WorkGenerationRequest {
  const types = WorkQuestionTypeSchema.options.filter(
    (type) => view.counts[type] > 0,
  );
  return {
    subjectId: view.subject.id,
    syllabusRevisionId: view.syllabusRevisionId,
    syllabusItemIds: view.topics.map((topic) => topic.syllabusItemId),
    title: view.title,
    ...(view.description === null ? {} : { description: view.description }),
    difficulty: view.difficulty,
    totalGrade: view.totalGrade,
    total: view.total,
    types,
    distribution:
      view.distribution === "AUTO"
        ? { mode: "AUTO" }
        : {
            mode: "MANUAL",
            counts: Object.fromEntries(
              types.map((type) => [type, view.counts[type]]),
            ),
          },
    trickQuestions: view.trickQuestions,
    idempotencyKey,
    regeneratedFromId: view.id,
  };
}

export const SUBJECT_REQUIRED = "Escolha a disciplina.";
export const TOPICS_REQUIRED = "Escolha de 1 a 10 tópicos da ementa.";
export const TOPICS_PER_QUESTION =
  "Cada questão trata de até 3 tópicos: escolha no máximo 3 tópicos por questão pedida.";
export const TITLE_REQUIRED = "Informe o título do trabalho.";
export const TYPES_REQUIRED = "Escolha ao menos um tipo.";
export const COUNTS_INVALID =
  "Informe a quantidade de cada tipo escolhido; a soma deve ser igual ao total.";
export const TRICKS_TOO_MANY =
  "As pegadinhas não podem passar do número de questões de múltipla escolha.";

/** The form fields, in the order of the error summary. */
export const GENERATION_FIELDS = [
  "subjectId",
  "syllabusItemIds",
  "title",
  "description",
  "difficulty",
  "totalGrade",
  "total",
  "types",
  "counts",
  "trickQuestions",
] as const;
export type GenerationField = (typeof GENERATION_FIELDS)[number];

/** Contract issue → the form field and its message (the rules the API applies, research W6). */
function fieldOf(
  path: readonly PropertyKey[],
  message: string,
): { field: GenerationField | "form"; message: string } {
  const [head] = path;
  if (head === "subjectId")
    return { field: "subjectId", message: SUBJECT_REQUIRED };
  if (head === "syllabusRevisionId" || head === "syllabusItemIds")
    return {
      field: "syllabusItemIds",
      message:
        message === "TOO_MANY_TOPICS_FOR_TOTAL"
          ? TOPICS_PER_QUESTION
          : TOPICS_REQUIRED,
    };
  if (head === "title") return { field: "title", message: TITLE_REQUIRED };
  if (head === "description")
    return { field: "description", message: INVALID_DATA };
  if (head === "difficulty")
    return { field: "difficulty", message: "Escolha a dificuldade." };
  if (head === "totalGrade")
    return {
      field: "totalGrade",
      message:
        message === "BELOW_MINIMUM_PER_QUESTION"
          ? BELOW_MINIMUM_MESSAGE
          : GRADE_FORMAT_MESSAGE,
    };
  if (head === "types") return { field: "types", message: TYPES_REQUIRED };
  if (head === "distribution")
    return { field: "counts", message: COUNTS_INVALID };
  if (head === "trickQuestions")
    return {
      field: "trickQuestions",
      message:
        message === "ABOVE_MULTIPLE_CHOICE" ? TRICKS_TOO_MANY : INVALID_DATA,
    };
  if (head === "total")
    return {
      field: "total",
      message:
        message === "BELOW_TYPE_COUNT"
          ? "Peça ao menos uma questão por tipo escolhido."
          : "Escolha de 1 a 10 questões.",
    };
  return { field: "form", message: INVALID_DATA };
}

/** The form's resolver schema: the values, checked by `WorkGenerationRequestSchema` as a request. */
export const WorkGenerationFormSchema = z
  .custom<WorkGenerationFormValues>()
  .superRefine((values, ctx) => {
    const result = WorkGenerationRequestSchema.safeParse(
      toWorkGenerationRequest(values, "00000000-0000-4000-8000-000000000000"),
    );
    if (result.success) return;
    const seen = new Set<string>();
    for (const issue of result.error.issues) {
      const { field, message } = fieldOf(issue.path, issue.message);
      if (seen.has(field)) continue;
      seen.add(field);
      ctx.addIssue({ code: "custom", path: [field], message });
    }
  });
