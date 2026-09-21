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

  it("loads the shipped list", () => {
    expect(loadCommonPasswords().size).toBeGreaterThan(9_000);
  });
});
