import {
  batchCounts,
  type ExerciseBatchRequest,
  ExerciseBatchRequestSchema,
  type ExerciseDifficulty,
  type ExerciseType,
  type ExerciseTypeCounts,
} from "@repo/contracts";
import { z } from "zod";
import { INVALID_DATA } from "@/lib/forms/field-messages";

/**
 * "Criar com IA" (010 contracts/web-ui.md): the topic (Disciplina → Ementa → Tópico), the
 * difficulty, the total, the types and their distribution, and the trick questions. The language
 * is not a field: it comes from the syllabus (FR-040).
 */
export interface GenerationFormValues {
  subjectId: string;
  revisionId: string;
  syllabusItemId: string;
  difficulty: ExerciseDifficulty | "";
  total: string;
  types: ExerciseType[];
  distributionMode: "AUTO" | "MANUAL";
  counts: Record<ExerciseType, string>;
  trickQuestions: string;
}

export const emptyGenerationForm = (): GenerationFormValues => ({
  subjectId: "",
  revisionId: "",
  syllabusItemId: "",
  difficulty: "",
  total: "5",
  types: ["OPEN_ANSWER", "MULTIPLE_CHOICE"],
  distributionMode: "AUTO",
  counts: { OPEN_ANSWER: "", MULTIPLE_CHOICE: "", CODE: "" },
  trickQuestions: "0",
});

const asInt = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

/** The contract's request for the form's values; incomplete values are the contract's to refuse. */
export function toBatchRequest(
  values: GenerationFormValues,
  idempotencyKey: string,
): ExerciseBatchRequest {
  const types = Array.isArray(values.types) ? values.types : [];
  return {
    syllabusRevisionId: values.revisionId || undefined,
    syllabusItemId: values.syllabusItemId || undefined,
    difficulty: values.difficulty || undefined,
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
  } as ExerciseBatchRequest;
}

/** What each counts per type would be now (the preview of the automatic distribution, or the manual ones). */
export function previewCounts(
  values: GenerationFormValues,
): ExerciseTypeCounts {
  const types = Array.isArray(values.types) ? values.types : [];
  const total = asInt(values.total) ?? 0;
  if (values.distributionMode === "AUTO")
    return batchCounts({ total, types, distribution: { mode: "AUTO" } });
  return {
    OPEN_ANSWER: types.includes("OPEN_ANSWER")
      ? (asInt(values.counts.OPEN_ANSWER) ?? 0)
      : 0,
    MULTIPLE_CHOICE: types.includes("MULTIPLE_CHOICE")
      ? (asInt(values.counts.MULTIPLE_CHOICE) ?? 0)
      : 0,
    CODE: types.includes("CODE") ? (asInt(values.counts.CODE) ?? 0) : 0,
  };
}

export const TOPIC_REQUIRED = "Escolha o tópico da ementa.";
export const TYPES_REQUIRED = "Escolha ao menos um tipo.";
export const COUNTS_INVALID =
  "Informe a quantidade de cada tipo escolhido; a soma deve ser igual ao total.";
export const TRICKS_TOO_MANY =
  "As pegadinhas não podem passar do número de questões de múltipla escolha.";

/** Contract issue → the form field and its message (the same rules the API applies, FR-006). */
function fieldOf(
  path: readonly PropertyKey[],
  message: string,
): { field: string; message: string } {
  const [head] = path;
  if (head === "syllabusRevisionId" || head === "syllabusItemId")
    return { field: "syllabusItemId", message: TOPIC_REQUIRED };
  if (head === "difficulty")
    return { field: "difficulty", message: "Escolha a dificuldade." };
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
    return { field: "total", message: "Escolha de 3 a 10 exercícios." };
  return { field: String(head ?? "form"), message: INVALID_DATA };
}

/** The form's resolver schema: the values, checked by `ExerciseBatchRequestSchema` as a request. */
export const GenerationFormSchema = z
  .custom<GenerationFormValues>()
  .superRefine((values, ctx) => {
    const result = ExerciseBatchRequestSchema.safeParse(
      toBatchRequest(values, "00000000-0000-4000-8000-000000000000"),
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
