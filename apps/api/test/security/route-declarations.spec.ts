import { Controller, Get, type INestApplicationContext, RequestMethod, type Type } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module";
import {
  ALLOW_UNVERIFIED_KEY,
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from "../../src/modules/access-control/decorators";
import { LogCapture } from "../helpers/log-capture";
import { testConfig } from "../helpers/test-app";

interface RouteInfo {
  route: string;
  declared: string[];
}

async function compileApp(controllers: Type[] = []): Promise<INestApplicationContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(testConfig(), { logDestination: new LogCapture() }), DiscoveryModule],
    controllers,
  }).compile();
  return moduleRef.init();
}

/** Every handler of every registered controller, with the access decorators it declares. */
function collectRoutes(app: INestApplicationContext): RouteInfo[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);

  const routes: RouteInfo[] = [];
  for (const { instance, metatype } of discovery.getControllers()) {
    if (!instance || !metatype) continue;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
    const controllerPath = Reflect.getMetadata(PATH_METADATA, metatype) as string;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name] as object;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (path === undefined) continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
      const targets = [handler as () => unknown, metatype];
      const declared: string[] = [];
      if (reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) declared.push("@Public");
      if (reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, targets)) declared.push("@AllowUnverified");
      if (reflector.getAllAndMerge<string[]>(REQUIRED_PERMISSIONS_KEY, targets).length > 0) {
        declared.push("@RequirePermissions");
      }
      routes.push({ route: `${RequestMethod[method]} /${controllerPath}/${path}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1"), declared });
    }
  }
  return routes;
}

const undeclared = (routes: RouteInfo[]) => routes.filter((r) => r.declared.length === 0).map((r) => r.route);

/**
 * Deny-by-default is only as good as its declarations (R9, plan "Fluxo de requisição
 * protegida"): every registered route must say explicitly who may call it.
 */
describe("route access declarations", () => {
  let app: INestApplicationContext;
  let routes: RouteInfo[];

  beforeAll(async () => {
    app = await compileApp();
    routes = collectRoutes(app);
  });
  afterAll(() => app.close());

  it("discovers the registered routes", () => {
    expect(routes.map((r) => r.route)).toEqual(expect.arrayContaining([
        "GET /health/live",
        "GET /health/ready",
        "POST /auth/verify-email",
        "POST /auth/verify-email/resend",
        "GET /me",
        "POST /auth/login",
        "POST /auth/logout",
        "POST /auth/logout-all",
        "POST /auth/password-reset/request",
        "POST /auth/password-reset/confirm",
        "GET /me/sessions",
        "GET /me/sessions/:id",
        "DELETE /me/sessions/:id",
        "POST /admin-activation",
        "POST /admin-activation/preview",
        "POST /invitations/preview",
        "POST /invitations/accept",
  "POST /class-invitations/preview",
  "POST /class-invitations/accept",
        "GET /managers",
        "POST /managers/:userId/deactivate",
        "POST /managers/:userId/reactivate",
        "GET /manager-invitations",
        "POST /manager-invitations",
        "POST /manager-invitations/:id/resend",
        "POST /manager-invitations/:id/revoke",
        "GET /users",
        "GET /users/:id",
        "POST /users/:id/suspend",
        "POST /users/:id/reactivate",
        "GET /teachers",
        "GET /teachers/:userId",
        "POST /teachers/:userId/suspend",
        "POST /teachers/:userId/deactivate",
        "POST /teachers/:userId/reactivate",
        "GET /teacher-invitations",
        "POST /teacher-invitations",
        "POST /teacher-invitations/:id/resend",
        "POST /teacher-invitations/:id/revoke",
        // 006
        "POST /ai/executions",
        "GET /ai/executions",
        "GET /ai/executions/:id",
        "GET /ai/executions/:id/result",
        "POST /ai/executions/:id/cancel",
        "GET /ai/proposals",
        "GET /ai/proposals/:id",
        "POST /ai/proposals/:id/decision",
        "GET /ai/operations/health",
        "GET /ai/operations/metrics",
        "GET /ai/operations/agents",
        "GET /ai/operations/model-configs",
        "POST /ai/operations/agents/:key/status",
        "POST /ai/operations/model-configs/:key/status",
        // 009
        "GET /ai/operations/models",
        "GET /ai/operations/tasks",
        "PUT /ai/operations/tasks/:key/override",
        "DELETE /ai/operations/tasks/:key/override",
        // 007
        "GET /syllabus-documents/:id/ai",
        "POST /syllabus-documents/:id/ai-analyses",
        "POST /syllabus-documents/:id/ai-proposals/:proposalId/apply",
        // 010
        "POST /exercises/sets",
        "POST /exercises",
        "GET /exercises",
        "GET /exercises/:id",
        "PUT /exercises/:id",
        "POST /exercises/:id/approve",
        "POST /exercises/:id/archive",
        "POST /exercises/:id/restore",
        "DELETE /exercises/:id",
        "GET /programming-languages",
        "GET /exercise-generation/availability",
        "POST /exercise-batches",
        "GET /exercise-batches",
        "GET /exercise-batches/:id",
        "POST /exercise-batches/:id/approve",
        // 011
        "POST /works",
        "GET /works",
        "GET /works/programming-languages",
        "GET /works/:id",
        "GET /works/:id/student-preview",
        "PUT /works/:id",
        "POST /works/:id/approve",
        "POST /works/:id/archive",
        "POST /works/:id/restore",
        "GET /work-generation/availability",
        "POST /work-generation-requests",
        "GET /work-generation-requests",
        "GET /work-generation-requests/:id",
        // 012
        "GET /classes/:classId/activities",
        "POST /classes/:classId/activities/scope-check",
        "POST /classes/:classId/activities",
        "GET /classes/:classId/activities/:activityId",
        "PATCH /classes/:classId/activities/:activityId",
        "POST /classes/:classId/activities/:activityId/close",
        "POST /classes/:classId/activities/:activityId/cancel",
        "POST /classes/:classId/activities/:activityId/release",
        "GET /classes/:classId/activities/:activityId/attempts/:attemptId",
        "PUT /classes/:classId/activities/:activityId/attempts/:attemptId/grades",
        "POST /classes/:classId/activities/:activityId/attempts/:attemptId/accept-submission",
        "GET /me/dashboard",
        "GET /me/activities",
        "GET /me/activities/:activityId",
        "POST /me/activities/:activityId/attempt",
        "PUT /me/activities/:activityId/attempt/answers",
        "POST /me/activities/:activityId/attempt/submit",
      ]),
    );
  });

  it("every route declares @Public, @AllowUnverified or @RequirePermissions", () => {
    expect(undeclared(routes)).toEqual([]);
  });

  it("@Public is never combined with session or permission requirements", () => {
    const contradictory = routes
      .filter((r) => r.declared.includes("@Public") && r.declared.length > 1)
      .map((r) => `${r.route} ${r.declared.join(" ")}`);
    expect(contradictory).toEqual([]);
  });

  it("detects a route without declaration (control)", async () => {
    @Controller("fixture")
    class UndeclaredController {
      @Get("open")
      open() {
        return {};
      }
    }
    const withFixture = await compileApp([UndeclaredController]);
    try {
      expect(undeclared(collectRoutes(withFixture))).toEqual(["GET /fixture/open"]);
    } finally {
      await withFixture.close();
    }
  });
});
