import { describe, expect, it } from "vitest";
import {
  CreateActivityRequestSchema,
  CreateAssignmentRequestSchema,
  CreateExamActivityRequestSchema,
  CreateExerciseActivityRequestSchema,
  ErrorCodeSchema,
  UpdateActivityRequestSchema,
} from "../src/index.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

describe("023 formato do Trabalho (contracts/http-api.md)", () => {
  const common = { idempotencyKey: uuid(99), title: "Atividade", publishAt: null, acknowledgeOutOfScope: false };
  const assignment = (overrides: Record<string, unknown> = {}) => ({
    ...common,
    source: { type: "ASSIGNMENT", workId: uuid(5) },
    deadline: "2026-10-10T23:59:00.000Z",
    latePolicy: "REJECT",
    ...overrides,
  });
  const exercise = { ...common, source: { type: "EXERCISE", exerciseIds: [uuid(1)] } };
  const exam = { ...common, source: { type: "EXAM", examId: uuid(6) }, durationMinutes: 60 };

  it("023/FR-001 o Trabalho é individual por padrão e aceita 2 a 5 inteiros", () => {
    expect(CreateAssignmentRequestSchema.parse(assignment())).toMatchObject({ groupSize: null });
    for (const groupSize of [2, 3, 4, 5]) expect(CreateActivityRequestSchema.parse(assignment({ groupSize }))).toMatchObject({ groupSize });
    for (const groupSize of [1, 6, 2.5, "3", true]) expect(accepts(CreateActivityRequestSchema, assignment({ groupSize })), String(groupSize)).toBe(false);
  });

  it("023/FR-003 o Exercício e a Prova recusam o formato (corpos estritos)", () => {
    for (const groupSize of [3, null]) {
      expect(accepts(CreateExerciseActivityRequestSchema, { ...exercise, groupSize })).toBe(false);
      expect(accepts(CreateExamActivityRequestSchema, { ...exam, groupSize })).toBe(false);
      expect(accepts(CreateActivityRequestSchema, { ...exercise, groupSize })).toBe(false);
    }
  });

  it("023/FR-002 a edição aceita o formato como opcional, null volta a Individual", () => {
    expect(UpdateActivityRequestSchema.parse({ version: 1 })).not.toHaveProperty("groupSize");
    expect(UpdateActivityRequestSchema.parse({ version: 1, groupSize: 4 })).toMatchObject({ groupSize: 4 });
    expect(UpdateActivityRequestSchema.parse({ version: 1, groupSize: null })).toMatchObject({ groupSize: null });
    expect(accepts(UpdateActivityRequestSchema, { version: 1, groupSize: 6 })).toBe(false);
    expect(ErrorCodeSchema.options).toContain("GROUP_NEEDS_ATTENDANCE");
  });
});
