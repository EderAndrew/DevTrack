import { describe, expect, it } from "vitest";
import {
  CreateActivityRequestSchema,
  CreateAssignmentRequestSchema,
  CreateExamActivityRequestSchema,
  CreateExerciseActivityRequestSchema,
  ErrorBodySchema,
  ErrorCodeSchema,
  StartAttemptRequestSchema,
  TeacherAttemptGroupSchema,
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

describe("023 início do trabalho em grupo (contracts/http-api.md, research U6)", () => {
  it("023/FR-006 o início aceita memberIds (1 a 4, distintos) ou alone, nunca os dois", () => {
    expect(accepts(StartAttemptRequestSchema, {})).toBe(true);
    expect(accepts(StartAttemptRequestSchema, { memberIds: [uuid(1), uuid(2)] })).toBe(true);
    expect(accepts(StartAttemptRequestSchema, { alone: true })).toBe(true);
    expect(accepts(StartAttemptRequestSchema, { memberIds: [] })).toBe(false);
    expect(accepts(StartAttemptRequestSchema, { memberIds: [uuid(1), uuid(1)] })).toBe(false);
    expect(accepts(StartAttemptRequestSchema, { memberIds: [1, 2, 3, 4, 5].map(uuid) })).toBe(false);
    expect(accepts(StartAttemptRequestSchema, { alone: false })).toBe(false);
    expect(accepts(StartAttemptRequestSchema, { memberIds: [uuid(1)], alone: true })).toBe(false);
    expect(accepts(StartAttemptRequestSchema, { leaderId: uuid(1) })).toBe(false);
  });

  it("023/FR-006 a recusa nomeia só os ids indisponíveis", () => {
    const body = { statusCode: 409, code: "GROUP_MEMBERS_UNAVAILABLE", message: "x", details: { unavailableIds: [uuid(2)] } };
    expect(accepts(ErrorBodySchema, body)).toBe(true);
    expect(accepts(ErrorBodySchema, { ...body, details: { unavailableIds: [] } })).toBe(false);
    expect(ErrorCodeSchema.options).toEqual(expect.arrayContaining(["GROUP_MEMBERS_UNAVAILABLE", "GROUP_ALREADY_JOINED"]));
  });
});

describe("023/US6 fatos do grupo para o professor (contracts/http-api.md)", () => {
  const AT = "2026-10-30T13:00:00.000Z";
  const facts = {
    leaderId: uuid(1),
    members: [
      { id: uuid(1), name: "Ana", joinedAt: AT, addedById: null },
      { id: uuid(2), name: "Bruno", joinedAt: AT, addedById: uuid(1) },
    ],
    events: [{ kind: "EDITING_HANDED", reason: null, actorId: uuid(1), fromId: uuid(1), toId: uuid(2), occurredAt: AT }],
    saves: [{ questionId: uuid(9), entries: [{ studentId: uuid(2), revision: 1, savedAt: AT }] }],
  };

  it("023/FR-020 integrantes, passagens e salvamentos: só ids, nomes, tipos e horários", () => {
    expect(accepts(TeacherAttemptGroupSchema, facts)).toBe(true);
    // A system settlement has no actor and carries its reason.
    expect(accepts(TeacherAttemptGroupSchema, { ...facts, events: [{ ...facts.events[0], kind: "EDITING_RESET", reason: "PAUSED", actorId: null }] })).toBe(true);
    // Never an answer, a grade or a label.
    expect(accepts(TeacherAttemptGroupSchema, { ...facts, saves: [{ ...facts.saves[0], entries: [{ ...facts.saves[0]!.entries[0], text: "x" }] }] })).toBe(false);
    expect(accepts(TeacherAttemptGroupSchema, { ...facts, grade: "1.00" })).toBe(false);
    expect(accepts(TeacherAttemptGroupSchema, { ...facts, events: [{ ...facts.events[0], kind: "FRAUD" }] })).toBe(false);
  });
});
