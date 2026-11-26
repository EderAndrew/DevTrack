import { describe, expect, it } from "vitest";
import {
  DAY_KIND_HINTS,
  DAY_KIND_LABELS,
  DAY_KINDS,
  type DayMark,
  DayKindFormSchema,
  dotToken,
  formValuesOf,
  isMeetingKind,
  longDate,
  meetingCount,
  meetingNumbers,
  pendingToRequest,
} from "./day-kinds";

// 031 contracts/ui.md "Kinds", research CK9 and CK10.
const mark = (
  kind: DayMark["kind"],
  fields: Partial<DayMark> = {},
): DayMark => ({
  kind,
  description: null,
  absenceReason: null,
  absenceNotice: null,
  ...fields,
});

describe("031 day-kinds: rótulos, dicas, pontos e o pedido de gravação", () => {
  it("os nove tipos com rótulo, as dicas dos tipos descritos e os cinco que são encontro", () => {
    expect(DAY_KINDS.map((kind) => DAY_KIND_LABELS[kind])).toEqual([
      "Aula",
      "Prova",
      "Trabalho",
      "Revisão",
      "Reposição",
      "Feriado",
      "Recesso",
      "Evento especial",
      "Falta do professor",
    ]);
    expect(DAY_KIND_HINTS.HOLIDAY).toBe("Qual feriado?");
    expect(DAY_KIND_HINTS.SPECIAL_EVENT).toBe(
      "Qual evento? Ex.: palestra, workshop",
    );
    expect(Object.keys(DAY_KIND_HINTS)).toHaveLength(7);
    expect(DAY_KINDS.filter(isMeetingKind)).toEqual([
      "CLASS",
      "EXAM",
      "ASSIGNMENT",
      "REVIEW",
      "MAKEUP",
    ]);
  });

  it("o ponto de cada tipo vem de um token (CK9)", () => {
    expect(DAY_KINDS.map(dotToken)).toEqual([
      "primary",
      "danger",
      "warning",
      "info",
      "info",
      "muted-foreground",
      "muted-foreground",
      "success",
      "danger-text",
    ]);
  });

  it("pendingToRequest: dia novo Aula → add; outro tipo ou mudança → set; desmarcado → remove; igual → nada", () => {
    const saved = new Map<string, DayMark>([
      ["2027-03-03", mark("CLASS")],
      ["2027-03-10", mark("EXAM", { description: "P1" })],
      ["2027-03-17", mark("HOLIDAY", { description: "Feriado" })],
      ["2027-03-24", mark("CLASS")],
      ["2027-03-31", mark("TEACHER_ABSENCE", { absenceReason: "Consulta" })],
    ]);
    const pending = new Map<string, DayMark>([
      ["2027-03-03", mark("CLASS")],
      ["2027-03-10", mark("EXAM", { description: "P1 — Herança" })],
      ["2027-03-17", mark("HOLIDAY", { description: "Feriado" })],
      [
        "2027-03-31",
        mark("TEACHER_ABSENCE", {
          absenceReason: "Consulta",
          absenceNotice: "Atividade",
        }),
      ],
      ["2027-04-07", mark("CLASS")],
      ["2027-04-14", mark("SPECIAL_EVENT", { description: "Palestra" })],
    ]);

    expect(pendingToRequest(saved, pending)).toEqual({
      add: ["2027-04-07"],
      set: [
        { date: "2027-03-10", kind: "EXAM", description: "P1 — Herança" },
        {
          date: "2027-03-31",
          kind: "TEACHER_ABSENCE",
          absenceReason: "Consulta",
          absenceNotice: "Atividade",
        },
        { date: "2027-04-14", kind: "SPECIAL_EVENT", description: "Palestra" },
      ],
      remove: ["2027-03-24"],
    });
    expect(pendingToRequest(saved, new Map(saved))).toEqual({
      add: [],
      set: [],
      remove: [],
    });
  });

  it("um dia salvo que vira Aula vai em set (não em add)", () => {
    const saved = new Map([
      ["2027-03-17", mark("HOLIDAY", { description: "Feriado" })],
    ]);
    expect(
      pendingToRequest(saved, new Map([["2027-03-17", mark("CLASS")]])),
    ).toEqual({
      add: [],
      set: [{ date: "2027-03-17", kind: "CLASS" }],
      remove: [],
    });
  });

  it("meetingCount e meetingNumbers contam só os tipos de aula, em ordem de data", () => {
    const marks = new Map<string, DayMark>([
      ["2027-03-17", mark("HOLIDAY", { description: "F" })],
      ["2027-03-24", mark("EXAM", { description: "P1" })],
      ["2027-03-03", mark("CLASS")],
      ["2027-03-10", mark("TEACHER_ABSENCE", { absenceReason: "C" })],
      ["2027-03-31", mark("MAKEUP", { description: "R" })],
    ]);
    expect(meetingCount(marks)).toBe(3);
    expect([...meetingNumbers(marks)]).toEqual([
      ["2027-03-03", 1],
      ["2027-03-24", 2],
      ["2027-03-31", 3],
    ]);
  });

  it("o formulário valida só os campos do tipo escolhido e descarta os outros (031/FR-006)", () => {
    const parse = (values: Partial<ReturnType<typeof formValuesOf>>) =>
      DayKindFormSchema.safeParse({ ...formValuesOf(null), ...values });

    expect(parse({ kind: "CLASS", description: "sobra" }).data).toEqual(
      mark("CLASS"),
    );
    expect(
      parse({ kind: "HOLIDAY", description: "   " }).error?.issues[0],
    ).toMatchObject({
      path: ["description"],
      message: "Escreva a descrição.",
    });
    expect(
      parse({ kind: "HOLIDAY", description: "😀".repeat(121) }).success,
    ).toBe(false);
    expect(
      parse({
        kind: "HOLIDAY",
        description: ` ${"😀".repeat(120)} `,
        absenceReason: "x",
      }).data,
    ).toEqual(mark("HOLIDAY", { description: "😀".repeat(120) }));
    expect(parse({ kind: "TEACHER_ABSENCE" }).error?.issues[0]).toMatchObject({
      path: ["absenceReason"],
      message: "Escreva o motivo.",
    });
    expect(
      parse({
        kind: "TEACHER_ABSENCE",
        absenceReason: "Consulta",
        absenceNotice: "x".repeat(201),
      }).success,
    ).toBe(false);
    expect(
      parse({
        kind: "TEACHER_ABSENCE",
        absenceReason: " Consulta ",
        absenceNotice: "  ",
        description: "x",
      }).data,
    ).toEqual(mark("TEACHER_ABSENCE", { absenceReason: "Consulta" }));
  });

  it("a data por extenso, sem fuso", () => {
    expect(longDate("2026-11-16")).toBe(
      "segunda-feira, 16 de novembro de 2026",
    );
    expect(longDate("2027-03-07")).toBe("domingo, 7 de março de 2027");
  });
});
