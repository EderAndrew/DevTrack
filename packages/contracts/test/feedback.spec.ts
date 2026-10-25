import { describe, expect, it } from "vitest";
import {
  AdminFeedbackSchema,
  ChangeFeedbackStatusRequestSchema,
  CreateFeedbackRequestSchema,
  FEEDBACK_DAILY_LIMIT,
  FEEDBACK_EXCERPT_LENGTH,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  FeedbackCategorySchema,
  FeedbackStatusSchema,
  ListAdminFeedbacksQuerySchema,
  OriginPathSchema,
  StudentFeedbackSchema,
} from "../src/index.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;
const AT = "2026-10-25T13:00:00.000Z";

const body = (overrides: Record<string, unknown> = {}) => ({
  submissionId: uuid(1),
  category: "PROBLEM",
  message: "A página travou ao salvar.",
  originPath: "/minhas-atividades/abc",
  ...overrides,
});

describe("020 contratos do feedback dos alunos (contracts/http-api.md)", () => {
  it("020 constantes e enums: 10–2 000 caracteres, trecho de 140, 5 por dia", () => {
    expect([FEEDBACK_MESSAGE_MIN, FEEDBACK_MESSAGE_MAX, FEEDBACK_EXCERPT_LENGTH, FEEDBACK_DAILY_LIMIT]).toEqual([10, 2000, 140, 5]);
    expect(FeedbackCategorySchema.options).toEqual(["PROBLEM", "SUGGESTION", "PRAISE", "OTHER"]);
    expect(FeedbackStatusSchema.options).toEqual(["RECEIVED", "IN_REVIEW", "RESOLVED", "ARCHIVED"]);
  });

  it("020 corpo do POST estrito: campo desconhecido, categoria inválida ou submissionId fora de uuid recusados", () => {
    expect(accepts(CreateFeedbackRequestSchema, body())).toBe(true);
    expect(accepts(CreateFeedbackRequestSchema, body({ studentId: uuid(2) }))).toBe(false);
    expect(accepts(CreateFeedbackRequestSchema, body({ status: "RESOLVED" }))).toBe(false);
    expect(accepts(CreateFeedbackRequestSchema, body({ category: "BUG" }))).toBe(false);
    expect(accepts(CreateFeedbackRequestSchema, body({ submissionId: "abc" }))).toBe(false);
  });

  it("020 mensagem: 10–2 000 code points (emoji e acentos contam 1), aparada antes de contar", () => {
    expect(accepts(CreateFeedbackRequestSchema, body({ message: "😀".repeat(9) }))).toBe(false);
    expect(accepts(CreateFeedbackRequestSchema, body({ message: "😀".repeat(10) }))).toBe(true);
    expect(accepts(CreateFeedbackRequestSchema, body({ message: "ç".repeat(2000) }))).toBe(true);
    expect(accepts(CreateFeedbackRequestSchema, body({ message: "ç".repeat(2001) }))).toBe(false);
    expect(accepts(CreateFeedbackRequestSchema, body({ message: "😀".repeat(2000) }))).toBe(true);
    expect(accepts(CreateFeedbackRequestSchema, body({ message: "😀".repeat(2001) }))).toBe(false);
    expect(accepts(CreateFeedbackRequestSchema, body({ message: `   ${"a".repeat(9)}   ` }))).toBe(false);
    const parsed = CreateFeedbackRequestSchema.parse(body({ message: `  ${"a".repeat(2000)}\n ` }));
    expect(parsed.message).toBe("a".repeat(2000));
  });

  it("020 mensagem com NUL recusada", () => {
    expect(accepts(CreateFeedbackRequestSchema, body({ message: "texto com \u0000 no meio" }))).toBe(false);
  });

  it("020 originPath: só o pathname; ?, #, espaço, %, sem / inicial, //, .. ou 201 caracteres recusados; nulo e ausente aceitos", () => {
    for (const path of ["/", "/minhas-atividades/0f3a-1_b.c", "/a/..b/c..", "/a/./b", `/${"a".repeat(199)}`]) {
      expect(accepts(OriginPathSchema, path), path).toBe(true);
    }
    const invalid = ["/convite?token=abc", "/pagina#x", "/com espaco", "/a%20b", "minhas-atividades", `/${"a".repeat(200)}`, ""];
    const outsideThePortal = ["//evil.example/x", "//", "/..", "/a/../b", "/a/.."];
    for (const path of [...invalid, ...outsideThePortal]) {
      expect(accepts(OriginPathSchema, path), path).toBe(false);
      expect(accepts(CreateFeedbackRequestSchema, body({ originPath: path })), path).toBe(false);
    }
    expect(accepts(CreateFeedbackRequestSchema, body({ originPath: null }))).toBe(true);
    const { originPath: _omitted, ...withoutPath } = body();
    expect(accepts(CreateFeedbackRequestSchema, withoutPath)).toBe(true);
  });

  it("020 mudança de situação: RECEIVED e valores desconhecidos recusados", () => {
    for (const status of ["IN_REVIEW", "RESOLVED", "ARCHIVED"]) {
      expect(accepts(ChangeFeedbackStatusRequestSchema, { status }), status).toBe(true);
    }
    expect(accepts(ChangeFeedbackStatusRequestSchema, { status: "RECEIVED" })).toBe(false);
    expect(accepts(ChangeFeedbackStatusRequestSchema, { status: "DONE" })).toBe(false);
    expect(accepts(ChangeFeedbackStatusRequestSchema, { status: "RESOLVED", note: "x" })).toBe(false);
  });

  it("020 visão do aluno sem originPath, history, submissionId nem quem mudou a situação", () => {
    const own = { id: uuid(1), category: "SUGGESTION", message: "Uma sugestão qualquer.", status: "IN_REVIEW", createdAt: AT };
    expect(accepts(StudentFeedbackSchema, own)).toBe(true);
    expect(Object.keys(StudentFeedbackSchema.shape).sort()).toEqual(["category", "createdAt", "id", "message", "status"]);
    for (const extra of [{ originPath: "/x" }, { history: [] }, { submissionId: uuid(2) }, { statusChangedAt: AT }]) {
      expect(accepts(StudentFeedbackSchema, { ...own, ...extra }), JSON.stringify(extra)).toBe(false);
    }
  });

  it("020 visão do ADMIN com aluno, e-mail, origem e histórico", () => {
    const detail = {
      id: uuid(1),
      category: "PROBLEM",
      status: "RESOLVED",
      message: "A página travou ao salvar.",
      originPath: null,
      student: { id: uuid(2), name: "Ana", email: "ana@example.com" },
      createdAt: AT,
      statusChangedAt: AT,
      history: [{ fromStatus: "RECEIVED", toStatus: "RESOLVED", changedBy: { id: uuid(3), name: "Admin" }, changedAt: AT }],
    };
    expect(accepts(AdminFeedbackSchema, detail)).toBe(true);
    expect(accepts(AdminFeedbackSchema, { ...detail, student: { id: uuid(2), name: "Ana" } })).toBe(false);
  });

  it("020 filtros da lista do ADMIN: só valores conhecidos", () => {
    expect(accepts(ListAdminFeedbacksQuerySchema, {})).toBe(true);
    expect(accepts(ListAdminFeedbacksQuerySchema, { status: "RECEIVED", category: "PRAISE", cursor: "abc" })).toBe(true);
    expect(accepts(ListAdminFeedbacksQuerySchema, { status: "NEW" })).toBe(false);
    expect(accepts(ListAdminFeedbacksQuerySchema, { category: "BUG" })).toBe(false);
    expect(accepts(ListAdminFeedbacksQuerySchema, { studentId: uuid(1) })).toBe(false);
  });
});
