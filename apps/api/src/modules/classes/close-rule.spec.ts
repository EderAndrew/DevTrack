import { describe, expect, it } from "vitest";
import { canCloseClass } from "./close-rule";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("027/FR-022 o professor encerra/arquiva a disciplina da turma só depois do calendário", () => {
  it("sem calendário → não pode", () => {
    expect(canCloseClass({ endsOn: null }, "2027-07-01")).toBe(false);
  });

  it("antes do último dia → não pode", () => {
    expect(canCloseClass({ endsOn: day("2027-06-30") }, "2027-06-01")).toBe(false);
  });

  it("no último dia → não pode", () => {
    expect(canCloseClass({ endsOn: day("2027-06-30") }, "2027-06-30")).toBe(false);
  });

  it("no dia seguinte ao último → pode", () => {
    expect(canCloseClass({ endsOn: day("2027-06-30") }, "2027-07-01")).toBe(true);
  });
});
