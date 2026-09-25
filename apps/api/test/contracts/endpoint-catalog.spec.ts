import { type EndpointContract, endpoints, SyllabusUploadResultSchema } from "@repo/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { responseViolation } from "../helpers/contract-conformance.interceptor";
import { registeredRoutes } from "../helpers/routes";

// FR-002 / SC-002: every route of the API has exactly one contract entry, and every entry is a
// real route. Together with ContractConformanceInterceptor this keeps responses and contract in sync.
describe("002/US1-2 002/SC-002 catálogo de endpoints do contrato", () => {
  let routes: string[];
  const catalog = Object.values(endpoints).map((entry) => `${entry.method} ${entry.path}`);

  beforeAll(async () => {
    routes = (await registeredRoutes()).map((route) => route.route);
  });

  it("toda rota registrada no Nest tem uma entrada no catálogo", () => {
    expect(routes.filter((route) => !catalog.includes(route))).toEqual([]);
  });

  it("toda entrada do catálogo corresponde a uma rota registrada", () => {
    expect(catalog.filter((route) => !routes.includes(route))).toEqual([]);
  });

  it("003/FR-060 cobre as 37 rotas restantes da Fase 001 (sem o cadastro, 003/FR-048), as da 003, as da 004 e as da 006, sem entradas repetidas", () => {
    // 003 domains (classes, class invitations, enrollments, own classes) and 004 domains
    // (subjects, …); each story adds its routes.
    const phase003 = Object.keys(endpoints).filter((key) => /^(classes|classInvitations|enrollments|myClasses)\./.test(key));
    const phase004 = Object.keys(endpoints).filter((key) => /^(subjects|syllabusDocuments|syllabusRevisions|classMeetings|classPlans|topics)\./.test(key));
    const phase006 = Object.keys(endpoints).filter((key) => /^ai[A-Z]\w*\./.test(key));
    expect(new Set(catalog).size).toBe(catalog.length);
    expect(catalog).toHaveLength(37 + phase003.length + phase004.length + phase006.length);
    expect(routes).toHaveLength(37 + phase003.length + phase004.length + phase006.length);
  });
});

// 004 E5/E18: multipart uploads have no Zod body but a validated response; file downloads have
// no response schema at all.
describe("004 entradas de envio (upload) e de download (binary) no catálogo", () => {
  const catalog: Record<string, EndpointContract> = endpoints;

  it("rotas de envio não declaram body JSON, e só POST envia arquivo", () => {
    const uploads = Object.entries(catalog).filter(([, entry]) => entry.upload);
    expect(uploads.filter(([, entry]) => entry.body !== undefined || entry.method !== "POST").map(([key]) => key)).toEqual([]);
  });

  it("respostas binárias são sempre de GET com 200", () => {
    const binaries = Object.entries(catalog).filter(([, entry]) => entry.response === "binary");
    expect(binaries.filter(([, entry]) => entry.method !== "GET" || entry.status !== 200).map(([key]) => key)).toEqual([]);
  });

  const upload: EndpointContract = {
    method: "POST",
    path: "/subjects/:id/syllabus-documents",
    upload: true,
    response: SyllabusUploadResultSchema,
    status: 201,
  };
  const download: EndpointContract = { method: "GET", path: "/syllabus-documents/:id/file", response: "binary", status: 200 };

  it("a resposta de uma rota de envio continua conferida pelo contrato", () => {
    expect(responseViolation("upload", upload, { document: {}, duplicate: false })).toMatch(/^upload: resposta fora do contrato em document\./);
    expect(responseViolation("upload", upload, { duplicate: false })).toBe("upload: resposta fora do contrato em document");
  });

  it("uma resposta binária não é conferida (bytes, sem schema)", () => {
    expect(responseViolation("download", download, Buffer.from("%PDF-1.7"))).toBeNull();
    expect(responseViolation("download", download, undefined)).toBeNull();
  });

  it("204 continua exigindo resposta sem corpo", () => {
    const empty: EndpointContract = { method: "DELETE", path: "/x", response: null, status: 204 };
    expect(responseViolation("empty", empty, undefined)).toBeNull();
    expect(responseViolation("empty", empty, {})).toBe("empty: resposta sem corpo esperada (204)");
  });
});
