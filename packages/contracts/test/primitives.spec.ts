import { describe, expect, it } from "vitest";
import {
  EmailSchema,
  IsoDateTimeSchema,
  NameSchema,
  PasswordInputSchema,
  TokenSchema,
  UuidSchema,
} from "../src/common/primitives.js";

// Pins the behavior of apps/api/src/platform/http/schemas.ts as of Phase 001: the shared
// primitives must validate exactly as the API does today (FR-008).
describe("002/FR-008 primitivos do contrato equivalentes à validação da Fase 001", () => {
  describe("EmailSchema", () => {
    it("normaliza espaços e maiúsculas", () => {
      expect(EmailSchema.parse("  Ana.Souza@Example.COM ")).toBe("ana.souza@example.com");
    });

    it("aceita 254 caracteres e recusa 255", () => {
      const domain = "@example.com";
      expect(EmailSchema.safeParse("a".repeat(254 - domain.length) + domain).success).toBe(true);
      expect(EmailSchema.safeParse("a".repeat(255 - domain.length) + domain).success).toBe(false);
    });

    it("recusa formato inválido", () => {
      for (const value of ["", "ana", "ana@", "@example.com", "ana@example", "ana souza@example.com"]) {
        expect(EmailSchema.safeParse(value).success, value).toBe(false);
      }
    });
  });

  describe("NameSchema", () => {
    it("remove espaços das pontas", () => {
      expect(NameSchema.parse("  Ana Souza  ")).toBe("Ana Souza");
    });

    it("aceita 120 caracteres e recusa vazio, só espaços e 121 caracteres", () => {
      expect(NameSchema.safeParse("a".repeat(120)).success).toBe(true);
      expect(NameSchema.safeParse("").success).toBe(false);
      expect(NameSchema.safeParse("   ").success).toBe(false);
      expect(NameSchema.safeParse("a".repeat(121)).success).toBe(false);
    });

    it("recusa caracteres de controle", () => {
      for (const value of ["Ana\u0000", "Ana\u0007Souza", "Ana\u007f", "Ana\u009f"]) {
        expect(NameSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
      }
    });
  });

  describe("TokenSchema", () => {
    it("aceita 43 caracteres base64url", () => {
      expect(TokenSchema.safeParse("aZ09_-".padEnd(43, "x")).success).toBe(true);
    });

    it("recusa 42 ou 44 caracteres e caracteres fora de [A-Za-z0-9_-]", () => {
      expect(TokenSchema.safeParse("x".repeat(42)).success).toBe(false);
      expect(TokenSchema.safeParse("x".repeat(44)).success).toBe(false);
      for (const bad of ["+", "/", "=", " ", "."]) {
        expect(TokenSchema.safeParse(bad.padEnd(43, "x")).success, bad).toBe(false);
      }
    });
  });

  describe("PasswordInputSchema", () => {
    it("aceita até 1024 caracteres sem aplicar política de força e recusa 1025", () => {
      expect(PasswordInputSchema.safeParse("a").success).toBe(true);
      expect(PasswordInputSchema.safeParse("a".repeat(1024)).success).toBe(true);
      expect(PasswordInputSchema.safeParse("a".repeat(1025)).success).toBe(false);
    });

    it("não altera o valor recebido", () => {
      expect(PasswordInputSchema.parse("  senha com espaços  ")).toBe("  senha com espaços  ");
    });
  });

  describe("UuidSchema", () => {
    it("aceita UUID e recusa outros formatos", () => {
      expect(UuidSchema.safeParse("0f8fad5b-d9cb-469f-a165-70867728950e").success).toBe(true);
      for (const value of ["", "123", "0f8fad5b-d9cb-469f-a165-70867728950", "0f8fad5bd9cb469fa16570867728950e"]) {
        expect(UuidSchema.safeParse(value).success, value).toBe(false);
      }
    });
  });

  describe("IsoDateTimeSchema", () => {
    it("aceita a saída de Date#toISOString", () => {
      expect(IsoDateTimeSchema.safeParse(new Date("2026-09-22T12:34:56.789Z").toISOString()).success).toBe(true);
    });

    it("recusa data sem hora, texto livre e Date", () => {
      for (const value of ["2026-09-22", "22/09/2026 12:00", "ontem", new Date()]) {
        expect(IsoDateTimeSchema.safeParse(value).success, String(value)).toBe(false);
      }
    });
  });
});
