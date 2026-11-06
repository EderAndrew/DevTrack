import { describe, expect, it } from "vitest";
import { INVITATION_PASSWORD_MAX_LENGTH, INVITATION_PASSWORD_MIN_LENGTH, meetsInvitationPasswordRules } from "../src/index.js";

describe("FR-011a regras da senha de quem aceita um convite", () => {
  it("o limite é de 8 a 128 caracteres", () => {
    expect([INVITATION_PASSWORD_MIN_LENGTH, INVITATION_PASSWORD_MAX_LENGTH]).toEqual([8, 128]);
  });

  it.each([
    ["7 caracteres", "Abcde1!", false],
    ["8 caracteres", "Abcdef1!", true],
    ["128 caracteres", `Ab1!${"x".repeat(124)}`, true],
    ["129 caracteres", `Ab1!${"x".repeat(125)}`, false],
    ["sem maiúscula", "abcdef1!", false],
    ["sem minúscula", "ABCDEF1!", false],
    ["sem número", "Abcdefg!", false],
    ["sem caractere especial", "Abcdefg1", false],
    ["espaço não é caractere especial", "Abcdef 1", false],
    ["acentos contam como letras", "Éçãoabc1!", true],
    ["maiúscula acentuada basta", "éÉ12345!", true],
    ["vazia", "", false],
  ])("%s", (_label, password, expected) => {
    expect(meetsInvitationPasswordRules(password)).toBe(expected);
  });

  it.each([..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"])("%s é caractere especial", (special) => {
    expect(meetsInvitationPasswordRules(`Abcdef1${special}`)).toBe(true);
  });

  it("conta pontos de código, não unidades UTF-16", () => {
    expect(meetsInvitationPasswordRules(`Aa1!${"🔒".repeat(4)}`)).toBe(true);
    expect(meetsInvitationPasswordRules(`Aa1!${"🔒".repeat(124)}`)).toBe(true);
    expect(meetsInvitationPasswordRules(`Aa1!${"🔒".repeat(125)}`)).toBe(false);
  });
});
