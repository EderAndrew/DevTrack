import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { INVALID_DATA } from "@/lib/forms/field-messages";
import {
  ForgotPasswordFormSchema,
  forgotPasswordMessages,
  LoginFormSchema,
  loginMessages,
  ResendVerificationFormSchema,
  resendVerificationMessages,
  ResetPasswordFormSchema,
  resetPasswordMessages,
  SignupFormSchema,
  signupMessages,
} from "./forms";
import { AccountSearchFormSchema, accountSearchMessages } from "@/features/accounts/schemas/search-form";
import { ActivationPasswordFormSchema, activationPasswordMessages } from "@/features/admin-activation/schemas/activation-form";
import { AcceptancePasswordFormSchema, acceptancePasswordMessages } from "@/features/invitations/schemas/acceptance-form";
import { InviteManagerFormSchema, inviteManagerMessages } from "@/features/managers/schemas/invite-form";
import { InviteTeacherFormSchema, inviteTeacherMessages } from "@/features/teachers/schemas/invite-form";
import { PASSWORD_LENGTH_MESSAGE } from "./password";

/** Message of each invalid field, as React Hook Form shows it (first issue per field). */
function messages(schema: z.ZodType, map: z.core.$ZodErrorMap, values: Record<string, unknown>) {
  const result = schema.safeParse(values, { error: map });
  const found: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) found[String(issue.path[0])] ??= issue.message;
  return found;
}

const EMAIL = "aluna@example.test";
const PASSWORD = "senha-forte-do-aluno";
const LONG_NAME = "a".repeat(121);
const TOO_LONG_INPUT = "x".repeat(1025);

describe("002/FR-022 formulários validam com o schema do contrato e os textos da Fase 001 (S9)", () => {
  it.each([
    ["login", LoginFormSchema, loginMessages, { email: "", password: "" }, { email: "Informe seu e-mail.", password: "Informe sua senha." }],
    ["login", LoginFormSchema, loginMessages, { email: "  ", password: PASSWORD }, { email: "Informe seu e-mail." }],
    [
      "cadastro",
      SignupFormSchema,
      signupMessages,
      { name: " ", email: "", password: "" },
      { name: "Informe seu nome.", email: "Informe seu e-mail.", password: PASSWORD_LENGTH_MESSAGE },
    ],
    ["reenvio de verificação", ResendVerificationFormSchema, resendVerificationMessages, { email: "" }, { email: "Informe seu e-mail." }],
    ["esqueci a senha", ForgotPasswordFormSchema, forgotPasswordMessages, { email: "" }, { email: "Informe seu e-mail." }],
    [
      "redefinir senha",
      ResetPasswordFormSchema,
      resetPasswordMessages,
      { password: "", confirmation: "" },
      { password: PASSWORD_LENGTH_MESSAGE },
    ],
  ])("%s: campo vazio → texto atual do campo", (_form, schema, map, values, expected) => {
    expect(messages(schema, map, values)).toEqual(expected);
  });

  it.each([
    ["login", LoginFormSchema, loginMessages, { email: "sem-arroba", password: PASSWORD }, { email: INVALID_DATA }],
    ["login", LoginFormSchema, loginMessages, { email: EMAIL, password: TOO_LONG_INPUT }, { password: INVALID_DATA }],
    ["cadastro", SignupFormSchema, signupMessages, { name: LONG_NAME, email: "x@", password: PASSWORD }, { name: INVALID_DATA, email: INVALID_DATA }],
    ["cadastro", SignupFormSchema, signupMessages, { name: "Ana\u0007", email: EMAIL, password: PASSWORD }, { name: INVALID_DATA }],
    ["cadastro", SignupFormSchema, signupMessages, { name: "Ana", email: EMAIL, password: TOO_LONG_INPUT }, { password: INVALID_DATA }],
    ["reenvio de verificação", ResendVerificationFormSchema, resendVerificationMessages, { email: "a@b" }, { email: INVALID_DATA }],
    ["esqueci a senha", ForgotPasswordFormSchema, forgotPasswordMessages, { email: `${"a".repeat(250)}@b.co` }, { email: INVALID_DATA }],
  ])("%s: e-mail, nome ou tamanho inválido → \"Dados inválidos.\"", (_form, schema, map, values, expected) => {
    expect(messages(schema, map, values)).toEqual(expected);
  });

  it("senha fora de 12–128 caracteres mantém o texto da dica", () => {
    expect(messages(SignupFormSchema, signupMessages, { name: "Ana", email: EMAIL, password: "curta" })).toEqual({
      password: PASSWORD_LENGTH_MESSAGE,
    });
    expect(messages(SignupFormSchema, signupMessages, { name: "Ana", email: EMAIL, password: "x".repeat(129) })).toEqual({
      password: PASSWORD_LENGTH_MESSAGE,
    });
  });

  it("confirmação de senha diferente → texto atual, junto com o erro da senha", () => {
    expect(messages(ResetPasswordFormSchema, resetPasswordMessages, { password: PASSWORD, confirmation: "outra" })).toEqual({
      confirmation: "As senhas não coincidem.",
    });
    expect(messages(ResetPasswordFormSchema, resetPasswordMessages, { password: "curta", confirmation: "outra" })).toEqual({
      password: PASSWORD_LENGTH_MESSAGE,
      confirmation: "As senhas não coincidem.",
    });
  });

  it("valores válidos passam e saem normalizados como o contrato define", () => {
    expect(LoginFormSchema.parse({ email: "  Aluna@Example.TEST ", password: PASSWORD })).toEqual({ email: EMAIL, password: PASSWORD });
    expect(SignupFormSchema.parse({ name: " Ana ", email: EMAIL, password: PASSWORD })).toEqual({ name: "Ana", email: EMAIL, password: PASSWORD });
  });

  it("nenhuma mensagem em inglês (padrão do Zod)", () => {
    const invalid: [z.ZodType, z.core.$ZodErrorMap, Record<string, unknown>][] = [
      [LoginFormSchema, loginMessages, { email: 3, password: null, extra: true }],
      [SignupFormSchema, signupMessages, { name: 1, email: [], password: {} }],
      [ResendVerificationFormSchema, resendVerificationMessages, { email: "@" }],
      [ForgotPasswordFormSchema, forgotPasswordMessages, {}],
      [ResetPasswordFormSchema, resetPasswordMessages, { password: 5, confirmation: 6 }],
    ];
    for (const [schema, map, values] of invalid) {
      for (const message of Object.values(messages(schema, map, values))) {
        expect(message).not.toMatch(/\b(invalid|expected|required|string|too|must|input)\b/i);
      }
    }
  });
});

describe("002/FR-022 formulários das demais features (S9)", () => {
  it.each([
    ["convite de gestor", InviteManagerFormSchema, inviteManagerMessages],
    ["convite de professor", InviteTeacherFormSchema, inviteTeacherMessages],
  ])("%s: vazio → texto atual; inválido → \"Dados inválidos.\"", (_form, schema, map) => {
    expect(messages(schema, map, { displayName: " ", email: "" })).toEqual({ displayName: "Informe o nome.", email: "Informe o e-mail." });
    expect(messages(schema, map, { displayName: LONG_NAME, email: "x@" })).toEqual({ displayName: INVALID_DATA, email: INVALID_DATA });
  });

  it.each([
    ["aceite de convite", AcceptancePasswordFormSchema, acceptancePasswordMessages],
    ["ativação de administrador", ActivationPasswordFormSchema, activationPasswordMessages],
  ])("%s: senha vazia ou fora de 12–128 → texto da dica; acima do contrato → \"Dados inválidos.\"", (_form, schema, map) => {
    expect(messages(schema, map, { password: "" })).toEqual({ password: PASSWORD_LENGTH_MESSAGE });
    expect(messages(schema, map, { password: "curta" })).toEqual({ password: PASSWORD_LENGTH_MESSAGE });
    expect(messages(schema, map, { password: TOO_LONG_INPUT })).toEqual({ password: INVALID_DATA });
    expect(messages(schema, map, { password: PASSWORD })).toEqual({});
  });

  it("busca de contas: vazia é válida; acima de 120 caracteres → \"Dados inválidos.\"", () => {
    expect(messages(AccountSearchFormSchema, accountSearchMessages, { query: "" })).toEqual({});
    expect(messages(AccountSearchFormSchema, accountSearchMessages, { query: LONG_NAME })).toEqual({ query: INVALID_DATA });
  });
});
