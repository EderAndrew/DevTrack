import {
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  RequestMethod,
  type Type,
} from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { type EndpointContract, endpoints } from "@repo/contracts";
import { map, type Observable } from "rxjs";

/** `POST /teachers/:userId/suspend`: the route as Nest registers it, without the global `/api` prefix. */
export function routeKey(method: RequestMethod, controllerPath: string, handlerPath: string): string {
  return `${RequestMethod[method]} /${controllerPath}/${handlerPath}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
}

const CATALOG = new Map<string, { key: string; contract: EndpointContract }>(
  Object.entries(endpoints).map(([key, contract]) => [`${contract.method} ${contract.path}`, { key, contract }]),
);

export class ContractViolationError extends Error {
  override readonly name = "ContractViolationError";
}

/**
 * Test-only (002 S6, FR-002): checks every value a handler returns against the response schema
 * of its `@repo/contracts` endpoint. A violation becomes a 500, so the test that made the
 * request fails on its status assertion. The error names the endpoint and the offending field
 * paths only — never values, which may be secrets (001/SC-005).
 */
export class ContractConformanceInterceptor implements NestInterceptor {
  /** `ignored`: controllers mounted only by a test (`createTestApp({ controllers })`), outside the catalog. */
  constructor(private readonly ignored: ReadonlySet<Type> = new Set()) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const controller = context.getClass();
    if (context.getType() !== "http" || this.ignored.has(controller)) return next.handle();

    const handler = context.getHandler();
    const route = routeKey(
      Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod,
      Reflect.getMetadata(PATH_METADATA, controller) as string,
      Reflect.getMetadata(PATH_METADATA, handler) as string,
    );
    const entry = CATALOG.get(route);
    if (!entry) throw violation(`${route}: rota sem contrato em @repo/contracts`);

    return next.handle().pipe(
      map((value: unknown) => {
        const { key, contract } = entry;
        if (contract.response === null) {
          if (value !== undefined) throw violation(`${key}: resposta sem corpo esperada (204)`);
          return value;
        }
        const result = contract.response.safeParse(value);
        if (!result.success) {
          const paths = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "(raiz)"))];
          throw violation(`${key}: resposta fora do contrato em ${paths.join(", ")}`);
        }
        return value;
      }),
    );
  }
}

function violation(message: string): ContractViolationError {
  // The global filter answers 500 and the captured logs are discarded by default: print it too.
  console.error(`[contract] ${message}`);
  return new ContractViolationError(message);
}
