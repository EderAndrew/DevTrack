import { describe, expect, it } from "vitest";
import {
  CohortDetailSchema,
  CohortDirectoryItemSchema,
  CohortDirectoryQuerySchema,
  CohortEnrollmentViewSchema,
  CohortListQuerySchema,
  CreateCohortRequestSchema,
  DirectEnrollmentRequestSchema,
  MyCohortListSchema,
  StudentLookupResponseSchema,
  UpdateCohortRequestSchema,
} from "../src/index.js";

const ID = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-11-18T12:00:00.000Z";
const cohort = {
  id: ID,
  name: "ADS 3NA",
  code: "ADS-3NA",
  academicYear: 2026,
  period: "2026.2",
  description: null,
  status: "ACTIVE",
  activeEnrollmentCount: 30,
  classCount: 2,
  createdAt: NOW,
  updatedAt: NOW,
};

describe("027 contratos da turma do gestor", () => {
  it("027/FR-001 a turma nasce com os campos da 003 e nada de professor, disciplina ou situação no corpo", () => {
    const body = { name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026, period: "2026.2" };
    expect(CreateCohortRequestSchema.safeParse(body).success).toBe(true);
    for (const field of ["teacherId", "subjectId", "status", "createdById"]) {
      expect(CreateCohortRequestSchema.safeParse({ ...body, [field]: ID }).success, field).toBe(false);
    }
    expect(CreateCohortRequestSchema.safeParse({ ...body, code: "ADS 3NA" }).success).toBe(false);
    expect(CreateCohortRequestSchema.safeParse({ ...body, academicYear: 1899 }).success).toBe(false);
  });

  it("027/FR-003 a edição é parcial, estrita e tem ao menos um campo", () => {
    expect(UpdateCohortRequestSchema.safeParse({ period: "2026.1" }).success).toBe(true);
    expect(UpdateCohortRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateCohortRequestSchema.safeParse({ status: "ARCHIVED" }).success).toBe(false);
  });

  it("027/FR-006 a lista filtra por ano e situação no servidor, com no máximo 50 por página", () => {
    expect(CohortListQuerySchema.parse({ academicYear: "2026", limit: "20" })).toEqual({ academicYear: 2026, limit: 20 });
    expect(CohortListQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
  });

  it("027/FR-007 o detalhe da turma mostra as disciplinas só por nome, professor e situação", () => {
    const classes = [{ id: ID, subjectName: "Banco de Dados", teacherName: "Eder", effectiveStatus: "ACTIVE" }];
    expect(CohortDetailSchema.safeParse({ ...cohort, classes }).success).toBe(true);
    for (const field of ["plan", "activities", "grades", "students"]) {
      const withField = [{ ...classes[0], [field]: [] }];
      expect(CohortDetailSchema.safeParse({ ...cohort, classes: withField }).success, field).toBe(false);
    }
  });

  it("027/FR-016 a busca do professor devolve só o mínimo para reconhecer a turma", () => {
    const item = { id: ID, name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026, period: null, classes: [] };
    expect(CohortDirectoryItemSchema.safeParse(item).success).toBe(true);
    for (const field of ["activeEnrollmentCount", "students", "invitations", "status"]) {
      expect(CohortDirectoryItemSchema.safeParse({ ...item, [field]: 1 }).success, field).toBe(false);
    }
    expect(CohortDirectoryQuerySchema.safeParse({ q: "  " }).success).toBe(false);
    expect(CohortDirectoryQuerySchema.safeParse({ q: "x".repeat(101) }).success).toBe(false);
  });

  it("027/FR-034 a consulta por e-mail responde só o nome, e quem não é apto é sempre o mesmo { found: false }", () => {
    const found = { found: true, studentUserId: ID, name: "Bruna", alreadyEnrolled: false };
    expect(StudentLookupResponseSchema.safeParse(found).success).toBe(true);
    expect(StudentLookupResponseSchema.safeParse({ ...found, email: "bruna@exemplo.com" }).success).toBe(false);
    expect(StudentLookupResponseSchema.safeParse({ found: false }).success).toBe(true);
    expect(StudentLookupResponseSchema.safeParse({ found: false, reason: "NOT_STUDENT" }).success).toBe(false);
    expect(DirectEnrollmentRequestSchema.safeParse({ email: "x@y.com", studentUserId: ID }).success).toBe(false);
  });

  it("027/FR-034 a matrícula da turma diz como nasceu (convite ou inclusão direta)", () => {
    const view = {
      id: ID,
      student: { userId: ID, name: "Bruna", email: "bruna@exemplo.com" },
      status: "ACTIVE",
      source: "DIRECT",
      enrolledAt: NOW,
      removedAt: null,
    };
    expect(CohortEnrollmentViewSchema.safeParse(view).success).toBe(true);
    expect(CohortEnrollmentViewSchema.safeParse({ ...view, source: "IMPORT" }).success).toBe(false);
  });

  it("027/FR-025 'Minhas turmas' agrupa por ano letivo, com cada disciplina e a sua situação efetiva", () => {
    const list = {
      years: [
        {
          academicYear: 2026,
          cohorts: [
            {
              id: ID,
              name: "ADS 3NA",
              code: "ADS-3NA",
              period: "2026.2",
              status: "INACTIVE",
              classes: [{ classId: ID, subjectName: "Redes", teacherName: "Ana", effectiveStatus: "ARCHIVED" }],
            },
          ],
        },
      ],
    };
    expect(MyCohortListSchema.safeParse(list).success).toBe(true);
    const withEmail = structuredClone(list);
    Object.assign(withEmail.years[0]!.cohorts[0]!.classes[0]!, { teacherEmail: "ana@exemplo.com" });
    expect(MyCohortListSchema.safeParse(withEmail).success).toBe(false);
  });
});
