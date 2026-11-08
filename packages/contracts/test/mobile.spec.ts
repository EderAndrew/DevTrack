import { describe, expect, it } from "vitest";
import {
  ErrorCodeSchema,
  ExamAlertPreferenceRequestSchema,
  ExamAlertPushDataSchema,
  MobileExamListSchema,
  MobileLoginRequestSchema,
  MobileSessionSchema,
  RegisterMobileDeviceRequestSchema,
} from "../src/index.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe("024 contratos do aplicativo (contracts/http-api.md)", () => {
  it("024/FR-001 o login do app tem as mesmas regras do login da web (estrito)", () => {
    expect(accepts(MobileLoginRequestSchema, { email: "Prof@Escola.br", password: "x" })).toBe(true);
    expect(MobileLoginRequestSchema.parse({ email: " Prof@Escola.br ", password: "x" }).email).toBe("prof@escola.br");
    expect(accepts(MobileLoginRequestSchema, { email: "prof@escola.br", password: "x", client: "MOBILE" })).toBe(false);
  });

  it("024/FR-003 a sessão do app traz o segredo uma única vez, com o formato dos tokens opacos", () => {
    const user = {
      id: uuid(1),
      name: "Prof",
      email: "prof@escola.br",
      emailVerified: true,
      roles: [{ key: "TEACHER", status: "ACTIVE" }],
      permissions: ["chamada.registrar"],
      theme: "DARK",
    };
    const token = "a".repeat(43);
    expect(accepts(MobileSessionSchema, { token, expiresAt: "2026-12-07T10:00:00.000Z", user })).toBe(true);
    expect(accepts(MobileSessionSchema, { token: "curto", expiresAt: "2026-12-07T10:00:00.000Z", user })).toBe(false);
  });

  it("024/FR-018 o registro do celular aceita só o token Expo e a plataforma", () => {
    const ok = { pushToken: "ExponentPushToken[abcdefghij_-12]", platform: "ANDROID" };
    expect(accepts(RegisterMobileDeviceRequestSchema, ok)).toBe(true);
    expect(accepts(RegisterMobileDeviceRequestSchema, { ...ok, pushToken: "ExpoPushToken[abcdefghij]" })).toBe(true);
    expect(accepts(RegisterMobileDeviceRequestSchema, { ...ok, pushToken: "ExponentPushToken[curto]" })).toBe(false);
    expect(accepts(RegisterMobileDeviceRequestSchema, { ...ok, pushToken: "fcm-token-qualquer" })).toBe(false);
    expect(accepts(RegisterMobileDeviceRequestSchema, { ...ok, pushToken: `ExponentPushToken[${"a".repeat(201)}]` })).toBe(false);
    expect(accepts(RegisterMobileDeviceRequestSchema, { ...ok, platform: "WEB" })).toBe(false);
    expect(accepts(RegisterMobileDeviceRequestSchema, { ...ok, userId: uuid(2) })).toBe(false);
  });

  it("024/FR-020 silenciar aceita só { muted: boolean }", () => {
    expect(accepts(ExamAlertPreferenceRequestSchema, { muted: true })).toBe(true);
    expect(accepts(ExamAlertPreferenceRequestSchema, { muted: "true" })).toBe(false);
    expect(accepts(ExamAlertPreferenceRequestSchema, { muted: false, activityId: uuid(3) })).toBe(false);
  });

  it("024/FR-006 a lista de provas em andamento traz turma, título, encerramento e silenciamento", () => {
    const item = { activityId: uuid(4), classId: uuid(5), className: "T1", title: "Prova 1", closesAt: "2026-11-07T12:00:00.000Z", muted: false };
    expect(accepts(MobileExamListSchema, { items: [item], serverNow: "2026-11-07T11:00:00.000Z" })).toBe(true);
    expect(accepts(MobileExamListSchema, { items: [{ ...item, studentEmail: "a@b.c" }], serverNow: "2026-11-07T11:00:00.000Z" })).toBe(false);
  });

  it("024/FR-016 o data do push leva só ids e o tipo", () => {
    const data = { kind: "HOLD", classId: uuid(5), activityId: uuid(4), studentUserId: uuid(6) };
    expect(accepts(ExamAlertPushDataSchema, data)).toBe(true);
    expect(accepts(ExamAlertPushDataSchema, { ...data, studentName: "Ana" })).toBe(false);
    expect(accepts(ExamAlertPushDataSchema, { ...data, kind: "FRAUD" })).toBe(false);
  });

  it("os códigos de erro do app estão no catálogo", () => {
    expect(ErrorCodeSchema.options).toEqual(expect.arrayContaining(["MOBILE_NOT_ALLOWED", "MOBILE_ROUTE_NOT_ALLOWED"]));
  });
});
