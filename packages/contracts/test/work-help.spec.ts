import { describe, expect, it } from "vitest";
import {
  HELP_QUESTION_MAX,
  HelpAvailabilitySchema,
  RequestHelpSchema,
  StudentHelpItemSchema,
  StudentHelpStateSchema,
  TeacherHelpItemSchema,
  WorkHelperOutputSchema,
  WorkHelpStatusSchema,
} from "../src/index.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;
const AT = "2026-10-07T12:00:00.000Z";
const item = (overrides: Record<string, unknown> = {}) => ({
  id: uuid(1),
  questionId: uuid(2),
  question: "Como começo?",
  status: "DELIVERED",
  message: "Pense no que a classe filha herda.",
  example: null,
  requestedAt: AT,
  resolvedAt: AT,
  ...overrides,
});

describe("015 ajuda da IA (contracts/http-api.md, contracts/work-helper.md)", () => {
  it("015/FR-020 o pedido termina uma vez em entregue, fora do assunto, bloqueado ou falhou", () => {
    expect(WorkHelpStatusSchema.options).toEqual(["REQUESTED", "DELIVERED", "OUT_OF_SCOPE", "BLOCKED", "FAILED"]);
  });

  it("015/FR-016 a pergunta tem de 1 a 500 caracteres; campos do servidor são recusados", () => {
    const body = { questionId: uuid(2), question: "Como começo?", idempotencyKey: uuid(3) };
    expect(HELP_QUESTION_MAX).toBe(500);
    expect(accepts(RequestHelpSchema, body)).toBe(true);
    expect(accepts(RequestHelpSchema, { ...body, question: "   " })).toBe(false);
    expect(accepts(RequestHelpSchema, { ...body, question: "x".repeat(500) })).toBe(true);
    expect(accepts(RequestHelpSchema, { ...body, question: "x".repeat(501) })).toBe(false);
    for (const field of ["status", "used", "allowance", "message", "reasonCode", "studentUserId", "attemptId"]) {
      expect(accepts(RequestHelpSchema, { ...body, [field]: "x" }), field).toBe(false);
    }
  });

  it("015/FR-018 015/FR-028 o aluno lê texto só de orientação entregue ou de recusa; bloqueado e falha vêm sem texto nem motivo", () => {
    expect(accepts(StudentHelpItemSchema, item())).toBe(true);
    expect(accepts(StudentHelpItemSchema, item({ example: { code: "class A {}" } }))).toBe(true);
    expect(accepts(StudentHelpItemSchema, item({ status: "OUT_OF_SCOPE", message: "Pergunte sobre a questão." }))).toBe(true);
    expect(accepts(StudentHelpItemSchema, item({ status: "OUT_OF_SCOPE", message: "x", example: { code: "x" } }))).toBe(false);
    for (const status of ["REQUESTED", "BLOCKED", "FAILED"]) {
      expect(accepts(StudentHelpItemSchema, item({ status, message: null, resolvedAt: status === "REQUESTED" ? null : AT })), status).toBe(true);
      expect(accepts(StudentHelpItemSchema, item({ status })), status).toBe(false);
    }
    for (const leak of ["reasonCode", "executionId", "expectedAnswer", "isCorrect"]) {
      expect(accepts(StudentHelpItemSchema, { ...item(), [leak]: "x" }), leak).toBe(false);
    }
  });

  it("015/FR-020 nunca mais de 3 ajudas usadas", () => {
    const state = { allowance: 3, used: 3, pending: false, items: [item()] };
    expect(accepts(StudentHelpStateSchema, state)).toBe(true);
    expect(accepts(StudentHelpStateSchema, { ...state, used: 4 })).toBe(false);
    expect(accepts(StudentHelpStateSchema, { ...state, allowance: 2 })).toBe(false);
  });

  it("015/FR-025 o professor vê o motivo de um bloqueio ou de uma falha", () => {
    const teacher = { ...item({ status: "BLOCKED", message: null }), questionPosition: 0, reasonCode: "SOLUTION_OVERLAP" };
    delete (teacher as { questionId?: string }).questionId;
    expect(accepts(TeacherHelpItemSchema, teacher)).toBe(true);
    expect(accepts(TeacherHelpItemSchema, { ...teacher, status: "FAILED", reasonCode: "AI_TIMEOUT" })).toBe(true);
    expect(accepts(TeacherHelpItemSchema, { ...teacher, reasonCode: "FRAUD" })).toBe(false);
  });

  it("015/FR-004 indisponível sempre com o motivo; disponível sem motivo", () => {
    expect(accepts(HelpAvailabilitySchema, { available: true, reason: null })).toBe(true);
    expect(accepts(HelpAvailabilitySchema, { available: false, reason: "AGENT_DISABLED" })).toBe(true);
    expect(accepts(HelpAvailabilitySchema, { available: false, reason: null })).toBe(false);
    expect(accepts(HelpAvailabilitySchema, { available: true, reason: "MODEL_UNAVAILABLE" })).toBe(false);
  });

  it("015/FR-017 015/FR-019 a saída do agente: orientação com exemplo opcional, ou recusa curta sem exemplo", () => {
    const output = { outcome: "GUIDANCE", message: "Releia o enunciado.", example: { code: "int x = 1;" } };
    expect(accepts(WorkHelperOutputSchema, output)).toBe(true);
    expect(accepts(WorkHelperOutputSchema, { ...output, example: null })).toBe(true);
    expect(accepts(WorkHelperOutputSchema, { ...output, outcome: "OUT_OF_SCOPE" })).toBe(false);
    expect(accepts(WorkHelperOutputSchema, { ...output, message: "" })).toBe(false);
    expect(accepts(WorkHelperOutputSchema, { ...output, message: "x".repeat(2001) })).toBe(false);
    expect(accepts(WorkHelperOutputSchema, { ...output, example: { code: "x".repeat(1501) } })).toBe(false);
    expect(accepts(WorkHelperOutputSchema, { ...output, answer: "B" })).toBe(false);
  });
});
