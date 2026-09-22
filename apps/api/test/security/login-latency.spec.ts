import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const RUNS = 20;
const P95_LIMIT_MS = 2000;

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

/**
 * SC-009: 95% of successful logins complete within 2 s. Measured against the API on the same
 * machine (a lower bound of what the user sees), with the real LOGIN_DELAY and the production
 * argon2 parameters — nothing is overridden.
 */
describe("SC-009 — latência do login bem-sucedido", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDb(t.prisma);
  });
  afterAll(() => t.close());

  it(`p95 de ${RUNS} logins sequenciais ≤ ${P95_LIMIT_MS} ms`, async () => {
    const user = await createUser(t);
    const login = () => api(t).post("/api/auth/login", { email: user.email, password: user.password });

    expect((await login()).status).toBe(200); // warm-up
    const durations: number[] = [];
    for (let i = 0; i < RUNS; i += 1) {
      const start = performance.now();
      const res = await login();
      durations.push(performance.now() - start);
      expect(res.status).toBe(200);
    }
    expect(percentile(durations, 95)).toBeLessThanOrEqual(P95_LIMIT_MS);
  });
});
