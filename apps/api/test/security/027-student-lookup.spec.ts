import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { STUDENT_LOOKUPS_PER_MINUTE } from "../../src/modules/enrollments/direct-enrollment.service";
import { createCohort, createUser, loginAs } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MARKER_EMAIL = "marcador-busca-027@exemplo.com";
const MARKER_NAME = "MARCADOR-NOME-027";

/**
 * 027/FR-034, research Q7 — the lookup by exact e-mail is a privileged disclosure: 30 lookups (and direct inclusions)
 * per MANAGER per minute, the 31st refused with `429` + `Retry-After` and audited; the e-mail and the name never
 * reach a URL, a log line or the audit trail.
 */
describe("027/FR-034 consulta de aluno por e-mail: limite e nada do e-mail em URL, log ou auditoria", () => {
  let t: TestApp;
  let logs: LogCapture;

  beforeAll(async () => {
    logs = new LogCapture();
    t = await createTestApp({ logs });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    logs.clear();
  });

  it("027/FR-034 a 31ª consulta do mesmo gestor em 1 min → 429 com Retry-After e cohort.student_lookup_rate_limited; a inclusão conta no mesmo limite; outro gestor não é afetado", async () => {
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const client = api(t, { cookie: await loginAs(t, manager) });
    const cohort = await createCohort(t);
    await createUser(t, { email: MARKER_EMAIL, name: MARKER_NAME });

    expect((await client.post(`/api/cohorts/${cohort.id}/enrollments`, { email: MARKER_EMAIL })).status).toBe(201);
    for (let i = 1; i < STUDENT_LOOKUPS_PER_MINUTE; i += 1) {
      expect((await client.post(`/api/cohorts/${cohort.id}/student-lookup`, { email: `x${i}@exemplo.com` })).status).toBe(200);
    }
    const refused = await client.post(`/api/cohorts/${cohort.id}/student-lookup`, { email: MARKER_EMAIL });
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe("RATE_LIMITED");
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    expect((await client.post(`/api/cohorts/${cohort.id}/enrollments`, { email: MARKER_EMAIL })).status).toBe(429);

    const limited = await t.prisma.auditEvent.findMany({ where: { type: "cohort.student_lookup_rate_limited" } });
    expect(limited).toHaveLength(2);
    expect(limited[0]).toMatchObject({ actorUserId: manager.id, targetType: "COHORT", targetId: cohort.id, metadata: { cohortId: cohort.id } });

    const other = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["MANAGER"] })) });
    expect((await other.post(`/api/cohorts/${cohort.id}/student-lookup`, { email: MARKER_EMAIL })).status).toBe(200);
  });

  it("027/FR-034 o e-mail e o nome consultados ficam fora das URLs, dos logs e da auditoria", async () => {
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const client = api(t, { cookie: await loginAs(t, manager) });
    const cohort = await createCohort(t);
    await createUser(t, { email: MARKER_EMAIL, name: MARKER_NAME });

    expect((await client.post(`/api/cohorts/${cohort.id}/student-lookup`, { email: MARKER_EMAIL })).body.found).toBe(true);
    expect((await client.post(`/api/cohorts/${cohort.id}/enrollments`, { email: MARKER_EMAIL })).status).toBe(201);
    expect((await client.post(`/api/cohorts/${cohort.id}/student-lookup`, { email: "MARCADOR-ausente-027@exemplo.com" })).body.found).toBe(false);
    await t.flushMail();

    const logText = logs.text();
    for (const marker of [MARKER_EMAIL, MARKER_NAME, "MARCADOR-ausente-027"]) {
      expect(logText.toLowerCase()).not.toContain(marker.toLowerCase());
    }
    const audit = await t.prisma.auditEvent.findMany({ where: { type: { in: ["cohort.student_lookup", "enrollment.created"] } } });
    expect(audit.length).toBeGreaterThanOrEqual(3);
    const auditText = JSON.stringify(audit.map((event) => event.metadata)).toLowerCase();
    expect(auditText).not.toContain("marcador");
    // The routes carry only ids; the e-mail travels in the body.
    expect(logText).not.toMatch(/student-lookup\?|enrollments\?email/);
  });
});
