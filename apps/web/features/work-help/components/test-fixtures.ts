import type { StudentHelpItem, StudentHelpState } from "@repo/contracts";

export const QUESTION_ID = "cccccccc-0000-4000-8000-000000000001";

/** One request of help of the student, DELIVERED unless overridden. */
export const helpItem = (overrides: Partial<StudentHelpItem> = {}): StudentHelpItem => ({
  id: "dddddddd-0000-4000-8000-000000000001",
  questionId: QUESTION_ID,
  question: "Por onde começo?",
  status: "DELIVERED",
  message: "Pense no que o enunciado pede antes de escrever.",
  example: null,
  requestedAt: "2026-10-02T12:00:00.000Z",
  resolvedAt: "2026-10-02T12:00:05.000Z",
  ...overrides,
});

export const helpState = (overrides: Partial<StudentHelpState> = {}): StudentHelpState => ({
  allowance: 3,
  used: 0,
  pending: false,
  items: [],
  ...overrides,
});
