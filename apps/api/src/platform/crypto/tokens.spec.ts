import { describe, expect, it } from "vitest";
import { generateToken, hashToken, hmacKey } from "./tokens";

describe("tokens (R7, R8)", () => {
  it("generateToken: 32 bytes in base64url (43 chars), unique", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(generateToken()).not.toBe(a);
  });

  it("hashToken is deterministic SHA-256 hex and differs from the token", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("hmacKey depends on secret, scope and value and never contains the value", () => {
    const secret = Buffer.alloc(32, 1);
    const key = hmacKey(secret, "login:email", "ana@example.com");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("ana");
    expect(hmacKey(secret, "login:email", "ana@example.com")).toBe(key);
    expect(hmacKey(secret, "login:ip", "ana@example.com")).not.toBe(key);
    expect(hmacKey(Buffer.alloc(32, 2), "login:email", "ana@example.com")).not.toBe(key);
  });
});
