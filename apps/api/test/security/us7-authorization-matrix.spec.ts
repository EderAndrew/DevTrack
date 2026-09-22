import type { RoleKey } from "@repo/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { concretePath, MATRIX, type MatrixEntry, ROLE_PERMISSIONS, routeKey } from "./authorization-matrix";

type Principal = "anônimo" | RoleKey | "STUDENT não verificado";
const PRINCIPALS: Principal[] = ["anônimo", "STUDENT", "TEACHER", "MANAGER", "ADMIN", "STUDENT não verificado"];

/**
 * US7-1, US7-2, SC-003: every protected route × every principal, straight at the API.
 * Bodies are `{}` and ids random, so the guards decide and nothing is written.
 */
describe("US7-1/US7-2 — matriz de autorização (contracts/permissions.md)", () => {
  let t: TestApp;
  const users = new Map<Principal, TestUser>();

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
    for (const role of ["STUDENT", "TEACHER", "MANAGER", "ADMIN"] as const) {
      users.set(role, await createUser(t, { roles: [role] }));
    }
    users.set("STUDENT não verificado", await createUser(t, { verified: false }));
  });
  afterAll(() => t.close());

  /** A fresh session per call, so logout/logout-all never affect the other cases. */
  const call = async (entry: MatrixEntry, principal: Principal) => {
    const user = users.get(principal);
    const client = api(t, { cookie: user ? await loginAs(t, user) : undefined });
    const url = concretePath(entry.path);
    if (entry.method === "GET") return client.get(url);
    if (entry.method === "DELETE") return client.delete(url);
    return client.post(url, {});
  };

  const expected = (entry: MatrixEntry, principal: Principal): { status: number; code: string } | "allowed" => {
    if (principal === "anônimo") return { status: 401, code: "UNAUTHENTICATED" };
    if (entry.access === "session") return "allowed";
    if (principal === "STUDENT não verificado") return { status: 403, code: "EMAIL_NOT_VERIFIED" };
    return ROLE_PERMISSIONS[principal].includes(entry.access) ? "allowed" : { status: 403, code: "FORBIDDEN" };
  };

  const cases = MATRIX.flatMap((entry) => PRINCIPALS.map((principal) => [routeKey(entry), principal, entry] as const));

  it.each(cases)("%s — %s", async (_route, principal, entry) => {
    const res = await call(entry, principal);
    const want = expected(entry, principal);
    if (want === "allowed") {
      expect([401, 403], `${routeKey(entry)} deveria ser permitido para ${principal} (${res.status} ${res.body?.code})`).not.toContain(
        res.status,
      );
    } else {
      expect({ status: res.status, code: res.body?.code }).toEqual(want);
    }
  });
});
