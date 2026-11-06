import { describe, expect, it } from "vitest";
import { AppException } from "../../platform/http/errors";
import { loadCommonPasswords, PasswordPolicy } from "./password-policy";

describe("PasswordPolicy (FR-011)", () => {
  const policy = new PasswordPolicy(loadCommonPasswords());

  it.each([
    ["11 characters", "k".repeat(10) + "Z", false],
    ["12 characters", "k".repeat(11) + "Z", true],
    ["128 characters", "k".repeat(127) + "Z", true],
    ["129 characters", "k".repeat(128) + "Z", false],
  ])("%s", (_label, password, ok) => {
    expect(policy.isAcceptable(password)).toBe(ok);
  });

  it("counts code points, not UTF-16 units", () => {
    expect(policy.isAcceptable("🔒".repeat(12))).toBe(true);
    expect(policy.isAcceptable("🔒".repeat(129))).toBe(false);
  });

  it("rejects passwords from the common list, case-insensitively", () => {
    expect(policy.isAcceptable("unbelievable")).toBe(false);
    expect(policy.isAcceptable("UnBelievable")).toBe(false);
    expect(policy.isAcceptable("unbelievable-horse")).toBe(true);
  });

  it("has no composition rules", () => {
    expect(policy.isAcceptable("apenas letras minusculas")).toBe(true);
  });

  it("validate() throws 400 WEAK_PASSWORD", () => {
    try {
      policy.validate("curta");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).toBody()).toMatchObject({ statusCode: 400, code: "WEAK_PASSWORD" });
    }
  });

  describe("FR-011a password chosen when accepting an invitation", () => {
    it.each([
      ["7 characters", "Abcde1!", false],
      ["8 characters", "Zebrua1!", true],
      ["128 characters", `Ab1!${"x".repeat(124)}`, true],
      ["129 characters", `Ab1!${"x".repeat(125)}`, false],
      ["no uppercase", "abcdef1!", false],
      ["no lowercase", "ABCDEF1!", false],
      ["no number", "Abcdefg!", false],
      ["no special character", "Abcdefg1", false],
    ])("%s", (_label, password, ok) => {
      expect(policy.isAcceptableForInvitation(password)).toBe(ok);
    });

    it("still rejects passwords from the common list, case-insensitively", () => {
      const withCommon = new PasswordPolicy(new Set(["zebrua@123"]));
      expect(withCommon.isAcceptableForInvitation("Zebrua@123")).toBe(false);
      expect(withCommon.isAcceptableForInvitation("Zebrua@1234")).toBe(true);
    });

    it("validateForInvitation() throws 400 WEAK_PASSWORD", () => {
      expect(() => policy.validateForInvitation("abcdefgh")).toThrow(AppException);
      expect(() => policy.validateForInvitation("Password1!")).toThrow(AppException);
      expect(() => policy.validateForInvitation("Zebrua1!")).not.toThrow();
    });

    it.each([
      ["a common word with a number and a symbol", "Password1!"],
      ["the same at the start", "1!Password"],
      ["symbols inside the word", "Pass-word1"],
      ["replaced letters", "P@ssw0rd1!"],
      ["one read as an i", "Adm1n@2026"],
      ["one read as an l", "We1come@26"],
      ["a common password with symbols added", "Abc@1234"],
      ["a common password with digits", "Qwerty@123"],
      ["accents", "Pássword1!"],
      ["a Portuguese word missing from the English list", "Senha@123"],
      ["Portuguese, replaced letters", "S3nh@2026!"],
      ["the product's name", "DevTrack1!"],
      ["a Portuguese word with its accent", "Bem-Vindo1!"],
    ])("rejects %s", (_label, password) => {
      expect(policy.isAcceptableForInvitation(password)).toBe(false);
    });

    it.each([
      ["a phrase of ordinary words", "Cavalo-correto-bateria-42"],
      ["a common word inside something longer", "Password-do-girassol-azul-7"],
      ["few letters left after removing the rest", "Ab7!2#9$kQ"],
      ["no word at all", "Zq8!mK2#"],
    ])("accepts %s", (_label, password) => {
      expect(policy.isAcceptableForInvitation(password)).toBe(true);
    });

    it("does not change the rule of the other flows", () => {
      expect(policy.isAcceptable("Abcdef1!")).toBe(false);
      expect(policy.isAcceptable("apenas letras minusculas")).toBe(true);
      expect(policy.isAcceptable("Password-123!")).toBe(true);
    });
  });

  it("loads the shipped list", () => {
    expect(loadCommonPasswords().size).toBeGreaterThan(9_000);
  });
});
