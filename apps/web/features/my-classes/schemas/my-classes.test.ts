import type { MyCohort, MyCohortList } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { ALL_YEARS, cardHeading, cardStatusBadge, filterSubjectCards, footerText, normalizeSearch, resolveYear, studentYears, subjectCards } from "./my-classes";

const ENROLLED = "2026-11-07T21:08:00.000Z";
const BD = "55555555-5555-4555-8555-555555555555";
const REDES = "66666666-6666-4666-8666-666666666666";
const OLD = "77777777-7777-4777-8777-777777777777";

const ADS_4NA: MyCohort = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  name: "ADS 4NA",
  code: "ADS-4NA",
  period: "Noite",
  status: "ACTIVE",
  enrolledAt: ENROLLED,
  classes: [
    { classId: BD, subjectName: "Banco de Dados", teacherName: "Prof. Eder", effectiveStatus: "ACTIVE" },
    { classId: REDES, subjectName: "Redes", teacherName: "Prof. Ana", effectiveStatus: "ARCHIVED" },
  ],
};
const EMPTY: MyCohort = { id: "cccccccc-3333-4333-8333-333333333333", name: "ADS 1NA", code: "ADS-1NA", period: null, status: "ACTIVE", enrolledAt: ENROLLED, classes: [] };
const CLOSED: MyCohort = {
  id: "bbbbbbbb-2222-4222-8222-222222222222",
  name: "ADS 3NA",
  code: "ADS-3NA",
  period: null,
  status: "INACTIVE",
  enrolledAt: "2026-02-01T12:00:00.000Z",
  classes: [{ classId: OLD, subjectName: null, teacherName: "Prof. Caio", effectiveStatus: "INACTIVE" }],
};
const LIST: MyCohortList = {
  years: [
    { academicYear: 2027, cohorts: [ADS_4NA, EMPTY] },
    { academicYear: 2026, cohorts: [CLOSED] },
  ],
};

describe("030 Minhas turmas — funções puras dos cards", () => {
  it("030/US1-1 um card por disciplina na ordem da API e um card da turma sem disciplinas", () => {
    const cards = subjectCards(LIST);
    expect(cards.map((card) => [card.key, card.classId, card.academicYear])).toEqual([
      [BD, BD, 2027],
      [REDES, REDES, 2027],
      [`cohort:${EMPTY.id}`, null, 2027],
      [OLD, OLD, 2026],
    ]);
    expect(cards[0]).toMatchObject({
      cohortName: "ADS 4NA",
      cohortCode: "ADS-4NA",
      period: "Noite",
      enrolledAt: ENROLLED,
      subjectName: "Banco de Dados",
      teacherName: "Prof. Eder",
    });
    expect(subjectCards(undefined)).toEqual([]);
  });

  it("030/US1-6 o selo da turma vale para todos os cards; o da disciplina só com a turma ativa", () => {
    const [bd, redes, empty, old] = subjectCards(LIST);
    expect(cardStatusBadge(bd!)).toBeNull();
    expect(cardStatusBadge(redes!)).toBe("Arquivada");
    expect(cardStatusBadge(empty!)).toBeNull();
    expect(cardStatusBadge(old!)).toBe("Encerrada");
  });

  it("030/US1-8 disciplina sem nome: o destaque é o nome da turma, sem \"Disciplina\"", () => {
    const [bd, , empty, old] = subjectCards(LIST);
    expect(cardHeading(bd!)).toEqual({ title: "Banco de Dados", isSubject: true });
    expect(cardHeading(old!)).toEqual({ title: "ADS 3NA", isSubject: false });
    expect(cardHeading(empty!)).toEqual({ title: "ADS 1NA", isSubject: false });
  });
});

describe("030 Minhas turmas — ano e busca (US2)", () => {
  it("030/US2-6 studentYears e resolveYear: ausente, mal formado ou de outro ano → o mais recente; todos; um ano válido", () => {
    const years = studentYears(LIST);
    expect(years).toEqual([2027, 2026]);
    expect(studentYears(undefined)).toEqual([]);
    expect(resolveYear(null, years)).toBe(2027);
    expect(resolveYear("", years)).toBe(2027);
    expect(resolveYear("20x6", years)).toBe(2027);
    expect(resolveYear("2026.0", years)).toBe(2027);
    expect(resolveYear("2025", years)).toBe(2027);
    expect(resolveYear("todos", years)).toBe(ALL_YEARS);
    expect(resolveYear("2026", years)).toBe(2026);
    expect(resolveYear("2026", [])).toBeNull();
  });

  it("030/US2-3 normalizeSearch: espaços nas pontas, só espaços, acentos e maiúsculas, corte em 100", () => {
    expect(normalizeSearch("  Orientação  ")).toBe("orientacao");
    expect(normalizeSearch("   ")).toBe("");
    expect(normalizeSearch(null)).toBe("");
    expect(normalizeSearch("ÁRVORES")).toBe("arvores");
    expect(normalizeSearch("a".repeat(150))).toHaveLength(100);
  });

  it("030/US2-3 filterSubjectCards por nome e código da turma e nome da disciplina, nunca pelo professor, combinado com o ano", () => {
    const cards = subjectCards(LIST);
    const keys = (year: number | typeof ALL_YEARS, search: string) => filterSubjectCards(cards, { year, search }).map((card) => card.key);
    expect(keys(2027, "")).toEqual([BD, REDES, `cohort:${EMPTY.id}`]);
    expect(keys(ALL_YEARS, "")).toEqual([BD, REDES, `cohort:${EMPTY.id}`, OLD]);
    expect(keys(2027, "  bánco ")).toEqual([BD]);
    expect(keys(ALL_YEARS, "ads-3")).toEqual([OLD]);
    expect(keys(2027, "ads 1na")).toEqual([`cohort:${EMPTY.id}`]);
    expect(keys(2027, "eder")).toEqual([]);
    expect(keys(2026, "banco")).toEqual([]);
  });

  it("030/US2-5 footerText: N de M turmas, singular quando M é 1", () => {
    expect(footerText(1, 2)).toBe("Mostrando 1 de 2 turmas");
    expect(footerText(1, 1)).toBe("Mostrando 1 de 1 turma");
    expect(footerText(0, 3)).toBe("Mostrando 0 de 3 turmas");
  });
});
