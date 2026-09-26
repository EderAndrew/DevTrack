import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { IS_PUBLIC_KEY } from "../../src/modules/access-control/decorators";
import { routeKey } from "./contract-conformance.interceptor";
import { LogCapture } from "./log-capture";
import { testConfig } from "./test-app";

export interface RegisteredRoute {
  /** e.g. `POST /teachers/:userId/suspend` (without the global `/api` prefix). */
  route: string;
  isPublic: boolean;
}

/** Every route of the application, discovered from a compiled AppModule (no HTTP server). */
export async function registeredRoutes(): Promise<RegisteredRoute[]> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(testConfig(), { logDestination: new LogCapture() }), DiscoveryModule],
  }).compile();
  const app = await moduleRef.init();
  try {
    const scanner = app.get(MetadataScanner);
    const reflector = app.get(Reflector);
    const routes: RegisteredRoute[] = [];
    for (const { instance, metatype } of app.get(DiscoveryService).getControllers()) {
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
      const base = Reflect.getMetadata(PATH_METADATA, metatype) as string;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name] as () => unknown;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined) continue;
        routes.push({
          route: routeKey(Reflect.getMetadata(METHOD_METADATA, handler), base, path),
          isPublic: Boolean(reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype])),
        });
      }
    }
    return routes;
  } finally {
    await app.close();
  }
}

/**
 * 007 routes already in the contract catalog (T006) whose controllers are not written yet.
 * Transitional: each user story removes the routes it implements, and T067 removes the empty set.
 */
export const PENDING_007_ROUTES: ReadonlySet<string> = new Set<string>([]);
