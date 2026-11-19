import { describe, expect, it } from "vitest";
import { classLabel } from "./class-label";

describe("027/FR-030 rótulo da disciplina da turma", () => {
  it("disciplina · turma", () => {
    expect(classLabel("Banco de Dados", "ADS 3NA")).toBe("Banco de Dados · ADS 3NA");
  });

  it("sem disciplina (turma migrada) → só a turma", () => {
    expect(classLabel(null, "ADS 3NA")).toBe("ADS 3NA");
    expect(classLabel(undefined, "ADS 3NA")).toBe("ADS 3NA");
  });
});
