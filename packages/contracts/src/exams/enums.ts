import { z } from "zod";

// Public enums of the Banco de Provas (018 data-model.md, research T2). The question model (type,
// grading strategy, difficulty, test-case visibility) is the 011 one, imported from `works/enums`
// and never redefined; the bank's own lifecycle has its own vocabulary, so the two banks evolve apart.

export const ExamStatusSchema = z.enum(["DRAFT", "APPROVED", "ARCHIVED"]);
export type ExamStatus = z.infer<typeof ExamStatusSchema>;

export const ExamOriginSchema = z.enum(["MANUAL", "AI_GENERATED"]);
export type ExamOrigin = z.infer<typeof ExamOriginSchema>;
