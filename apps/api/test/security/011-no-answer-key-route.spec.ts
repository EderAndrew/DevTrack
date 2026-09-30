import { endpoints, WorkGenerationRequestViewSchema, WorkPageSchema, WorkStudentViewSchema, WorkTeacherViewSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { MATRIX, ROLE_PERMISSIONS, routeKey } from "./authorization-matrix";

/**
 * 011/US8-8 011/FR-035: no route of 011 hands an answer key to a student. Every route of the
 * feature needs a permission no STUDENT holds; every route that answers the teacher view (with the
 * answer key) needs a permission that only comes with `trabalhos.visualizar`; and no route outside
 * the work bank answers a work at all. The release of results to students is 012's.
 */

type Endpoint = { method: string; path: string; response?: unknown };
const CATALOG = Object.entries(endpoints as Record<string, Endpoint>);
const WORK_ROUTE = /^\/(works|work-generation)/;
const ANSWERING_A_WORK = [WorkTeacherViewSchema, WorkStudentViewSchema, WorkPageSchema, WorkGenerationRequestViewSchema];

const accessOf = (endpoint: Endpoint) => MATRIX.find((entry) => routeKey(entry) === routeKey(endpoint as { method: never; path: string }))?.access;

describe("011/US8-8 011/FR-035 nenhuma rota da 011 entrega gabarito a aluno", () => {
  const workRoutes = CATALOG.filter(([, endpoint]) => WORK_ROUTE.test(endpoint.path));

  it("a varredura encontra as rotas da 011 no catálogo", () => {
    expect(workRoutes.map(([key]) => key)).toEqual(expect.arrayContaining(["works.get", "works.update", "works.approve", "works.studentPreview", "works.list"]));
  });

  it("toda rota da 011 exige uma permissão que nenhum ALUNO tem", () => {
    const student = new Set<string>(ROLE_PERMISSIONS.STUDENT);
    const open = workRoutes.flatMap(([key, endpoint]) => {
      const access = accessOf(endpoint);
      return access === undefined || access === "session" || student.has(access) ? [`${key}: ${access ?? "sem linha na matriz"}`] : [];
    });
    expect(open).toEqual([]);
  });

  it("toda rota que responde a visão do professor exige uma permissão que só vem com trabalhos.visualizar", () => {
    const withAnswerKey = CATALOG.filter(([, endpoint]) => endpoint.response === WorkTeacherViewSchema);
    expect(withAnswerKey.length).toBeGreaterThan(0);
    const leaks = withAnswerKey.flatMap(([key, endpoint]) => {
      const access = accessOf(endpoint);
      const roles = Object.entries(ROLE_PERMISSIONS).filter(([, permissions]) => (permissions as readonly string[]).includes(access ?? ""));
      const lacking = roles.filter(([, permissions]) => !(permissions as readonly string[]).includes("trabalhos.visualizar"));
      return access === undefined || roles.length === 0 || lacking.length > 0 ? [`${key}: ${access}`] : [];
    });
    expect(leaks).toEqual([]);
  });

  it("nenhuma rota fora do banco de trabalhos responde um trabalho", () => {
    const outside = CATALOG.filter(([, endpoint]) => !WORK_ROUTE.test(endpoint.path) && ANSWERING_A_WORK.includes(endpoint.response as never));
    expect(outside.map(([key]) => key)).toEqual([]);
  });
});
