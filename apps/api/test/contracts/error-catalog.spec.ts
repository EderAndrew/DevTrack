import { type ArgumentsHost, HttpException, Logger } from "@nestjs/common";
import { ErrorBodySchema, ErrorCodeSchema } from "@repo/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppException, ErrorCatalog } from "../../src/platform/http/errors";
import { GlobalExceptionFilter } from "../../src/platform/http/exception.filter";

/** Runs the global filter against a fake HTTP host and returns the JSON body it sends. */
function bodyFor(exception: unknown): unknown {
  let body: unknown;
  const response = {
    headersSent: false,
    setHeader: () => response,
    status: () => response,
    json: (value: unknown) => {
      body = value;
      return response;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new GlobalExceptionFilter().catch(exception, host);
  return body;
}

// FR-004 / S8: the API's error catalogue and the contract list the same codes, and every error
// body the API sends has the contract shape {statusCode, code, message}.
describe("002/US1-1 códigos e corpo de erro do contrato", () => {
  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(["log", "error", "warn"]));

  it("ErrorCatalog tem exatamente os códigos de ErrorCodeSchema, na mesma ordem", () => {
    expect(Object.keys(ErrorCatalog)).toEqual(ErrorCodeSchema.options);
  });

  it("o filtro global produz corpos válidos para todos os códigos do catálogo", () => {
    for (const code of ErrorCodeSchema.options) {
      const body = ErrorBodySchema.parse(bodyFor(new AppException(code)));
      expect(body).toEqual({ statusCode: ErrorCatalog[code].status, code, message: ErrorCatalog[code].message });
    }
  });

  it("erros do framework e erros desconhecidos também seguem o formato do contrato", () => {
    for (const status of [400, 401, 403, 404, 413, 415, 429]) {
      expect(ErrorBodySchema.safeParse(bodyFor(new HttpException("x", status))).success, String(status)).toBe(true);
    }
    expect(ErrorBodySchema.parse(bodyFor(new Error("boom")))).toMatchObject({ statusCode: 500, code: "INTERNAL_ERROR" });
  });
});
