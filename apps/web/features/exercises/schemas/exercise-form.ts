import {
  ALTERNATIVES_MIN,
  type CognitiveObjective,
  type ExerciseDifficulty,
  type ExerciseInput,
  ExerciseInputSchema,
  type ExerciseType,
} from "@repo/contracts";
import { z } from "zod";
import { INVALID_DATA } from "@/lib/forms/field-messages";

/** Labels of the exercise enums (010 contracts/web-ui.md). */
export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  OPEN_ANSWER: "Pergunta e resposta",
  MULTIPLE_CHOICE: "Múltipla escolha",
  CODE: "Exercício de código",
};
export const DIFFICULTY_LABELS: Record<ExerciseDifficulty, string> = {
  BASIC: "Básico",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
};
export const COGNITIVE_OBJECTIVE_LABELS: Record<CognitiveObjective, string> = {
  RECOGNIZE: "Reconhecer",
  UNDERSTAND: "Compreender",
  APPLY: "Aplicar",
  ANALYZE: "Analisar",
  CREATE: "Criar",
};

/**
 * One exercise card of the form. Every type's fields live in the card, so switching the type
 * keeps what was typed; `toExerciseInput` sends only the chosen type's. Each alternative has a
 * `key` of the form only, and the correct one is the key of the checked radio ("" while none is),
 * so the mark follows its alternative when another one is removed.
 */
export interface ExerciseCardValues {
  type: ExerciseType;
  statement: string;
  explanation: string;
  difficulty: ExerciseDifficulty | "";
  cognitiveObjective: CognitiveObjective | "";
  /** The topic: Disciplina → Ementa (a confirmed revision) → Tópico; only the item is sent. */
  subjectId: string;
  revisionId: string;
  syllabusItemId: string;
  expectedAnswer: string;
  alternatives: AlternativeFormValue[];
  correctAlternative: string;
  isTrickQuestion: boolean;
  instructions: string;
  starterCode: string;
  expectedSolution: string;
  languageId: string;
}

export interface AlternativeFormValue {
  key: string;
  text: string;
}

export const emptyAlternative = (): AlternativeFormValue => ({ key: crypto.randomUUID(), text: "" });

export interface ExerciseFormValues {
  cards: ExerciseCardValues[];
}

export const emptyCard = (): ExerciseCardValues => ({
  type: "OPEN_ANSWER",
  statement: "",
  explanation: "",
  difficulty: "",
  cognitiveObjective: "",
  subjectId: "",
  revisionId: "",
  syllabusItemId: "",
  expectedAnswer: "",
  alternatives: Array.from({ length: ALTERNATIVES_MIN }, emptyAlternative),
  correctAlternative: "",
  isTrickQuestion: false,
  instructions: "",
  starterCode: "",
  expectedSolution: "",
  languageId: "",
});

const optional = (value: string) => (value.trim() === "" ? undefined : value);

/** The contract's input for a card: blank optional fields are left out. */
export function toExerciseInput(card: ExerciseCardValues): ExerciseInput {
  const common = {
    statement: card.statement,
    explanation: card.explanation,
    difficulty: optional(card.difficulty),
    cognitiveObjective: optional(card.cognitiveObjective),
    syllabusItemId: optional(card.syllabusItemId),
  };
  // Incomplete values are the contract's to refuse (the form validates with it before sending).
  if (card.type === "OPEN_ANSWER") return { type: card.type, ...common, expectedAnswer: card.expectedAnswer } as ExerciseInput;
  if (card.type === "MULTIPLE_CHOICE") {
    return {
      type: card.type,
      ...common,
      alternatives: card.alternatives.map((alternative) => ({
        text: alternative.text,
        isCorrect: alternative.key === card.correctAlternative,
      })),
      isTrickQuestion: card.isTrickQuestion,
    } as ExerciseInput;
  }
  return {
    type: card.type,
    ...common,
    instructions: card.instructions,
    starterCode: optional(card.starterCode),
    expectedSolution: card.expectedSolution,
    languageId: optional(card.languageId),
  } as ExerciseInput;
}

/** What a blank required field says; anything else the contract refuses is "Dados inválidos.". */
const EMPTY_MESSAGES: Record<string, string> = {
  statement: "Informe o enunciado.",
  explanation: "Informe a explicação.",
  difficulty: "Escolha a dificuldade.",
  cognitiveObjective: "Escolha o objetivo cognitivo.",
  expectedAnswer: "Informe a resposta esperada.",
  text: "Informe o texto da alternativa.",
  instructions: "Informe as instruções.",
  expectedSolution: "Informe a solução esperada.",
  languageId: "Escolha a linguagem.",
};
export const CORRECT_COUNT_MESSAGE = "Marque a alternativa correta.";
export const DUPLICATE_TEXT_MESSAGE = "As alternativas não podem repetir o mesmo texto.";

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/** The value at a contract path of a card's input (to tell a blank field from an invalid one). */
function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<PropertyKey, unknown>)[key] : undefined), input);
}

/**
 * The form of 3–10 cards (`min`/`max`), each validated by the contract's `ExerciseInputSchema`
 * (the same rules the API applies, 010/FR-006), with the issues moved onto the card's fields.
 */
export function exerciseFormSchema(min: number, max: number) {
  return z
    .object({ cards: z.array(z.custom<ExerciseCardValues>()).min(min).max(max) })
    .superRefine(({ cards }, ctx) => {
      cards.forEach((card, index) => {
        const input = toExerciseInput(card);
        const result = ExerciseInputSchema.safeParse(input);
        if (result.success) return;
        for (const issue of result.error.issues) {
          const [field] = issue.path;
          if (field === "alternatives" && issue.path.length === 1) {
            const correct = issue.message === "CORRECT_COUNT";
            ctx.addIssue({
              code: "custom",
              path: ["cards", index, correct ? "correctAlternative" : "alternatives"],
              message: correct ? CORRECT_COUNT_MESSAGE : issue.message === "DUPLICATE_TEXT" ? DUPLICATE_TEXT_MESSAGE : INVALID_DATA,
            });
            continue;
          }
          const key = String(issue.path.at(-1));
          const message = isBlank(valueAt(input, issue.path)) ? (EMPTY_MESSAGES[key] ?? INVALID_DATA) : INVALID_DATA;
          ctx.addIssue({ code: "custom", path: ["cards", index, ...issue.path.map((part) => part as string | number)], message });
        }
      });
    });
}
