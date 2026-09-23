import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { progressiveDelayMs } from "../../src/platform/rate-limit/rate-limit.service";
import { createClass, createClassInvitation, createUser, DEFAULT_PASSWORD, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const WRONG = "senha-errada-mas-longa";
const IP_A = "203.0.113.10";
const IP_B = "203.0.113.20";

/** Records the delays the login asks for, without sleeping. */
function delaySpy() {
  const calls: number[] = [];
  const delay = async (ms: number) => {
    calls.push(ms);
  };
  return { calls, delay };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe("US2 — rate limit de autenticação (FR-022, R8)", () => {
  let t: TestApp;
  const spy = delaySpy();

  beforeAll(async () => {
    t = await createTestApp({ overrides: [{ provide: LOGIN_DELAY, useValue: spy.delay }] });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    spy.calls.length = 0;
  });

  const login = (email: string, password: string, ip: string) =>
    api(t).post("/api/auth/login", { email, password }).set("X-Forwarded-For", ip);

  it("US2-3/US2-4: 5 falhas de e-mail+origem bloqueiam só essa combinação; o dono entra por outra origem", async () => {
    const owner = await createUser(t);
    for (let i = 0; i < 5; i += 1) expect((await login(owner.email, WRONG, IP_A)).status).toBe(401);

    const blocked = await login(owner.email, owner.password, IP_A);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThanOrEqual(1);
    expect(await t.prisma.session.count()).toBe(0);

    const events = await t.prisma.auditEvent.findMany({ where: { type: "auth.rate_limit.blocked" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorType: "ANONYMOUS", metadata: { scope: "login_email_origin" } });
    const serialized = JSON.stringify(events, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
    expect(serialized).not.toContain(owner.email);
    expect(serialized).not.toContain(IP_A);

    const legit = await login(owner.email, owner.password, IP_B);
    expect(legit.status).toBe(200);
    expect(await t.prisma.session.count({ where: { userId: owner.id } })).toBe(1);
  });

  it("falhas do mesmo e-mail por várias origens: atraso progressivo e um alerta ao cruzar 10, sem bloqueio", async () => {
    const owner = await createUser(t);
    for (let i = 0; i < 12; i += 1) {
      expect((await login(owner.email, WRONG, `198.51.100.${i + 1}`)).status).toBe(401);
    }
    expect(spy.calls).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(progressiveDelayMs));
    expect(spy.calls.slice(5)).toEqual([250, 500, 1000, 2000, 4000, 8000, 8000]);

    const alerts = await t.prisma.auditEvent.findMany({ where: { type: "auth.rate_limit.alert" } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      actorType: "SYSTEM",
      targetType: "USER",
      targetId: owner.id,
      metadata: { failuresAcrossOrigins: 10 },
    });

    // The owner still gets in (delayed, never blocked).
    expect((await login(owner.email, owner.password, "198.51.100.200")).status).toBe(200);
  });

  it("turma atrás do mesmo IP (NAT): 40 logins e 40 aceites de convite de turma sem 429", async () => {
    const students = await Promise.all(Array.from({ length: 40 }, () => createUser(t)));
    for (const student of students) {
      expect((await login(student.email, student.password, IP_A)).status).toBe(200);
    }
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const schoolClass = await createClass(t, teacher.id);
    for (let i = 0; i < 40; i += 1) {
      const { token } = await createClassInvitation(t, schoolClass.id, uniqueEmail("turma"));
      const res = await api(t)
        .post("/api/class-invitations/accept", { token, name: `Aluno ${i}`, ra: `RA-NAT-${i}`, password: DEFAULT_PASSWORD })
        .set("X-Forwarded-For", IP_A);
      expect(res.status).toBe(200);
    }
  });

  it("e-mail inexistente × senha errada: latência mediana na mesma ordem de grandeza", async () => {
    const users = await Promise.all(Array.from({ length: 5 }, () => createUser(t)));
    const timed = async (email: string, ip: string) => {
      const start = performance.now();
      expect((await login(email, WRONG, ip)).status).toBe(401);
      return performance.now() - start;
    };
    await timed(uniqueEmail("aquecimento"), "192.0.2.250");

    const unknown: number[] = [];
    const wrong: number[] = [];
    for (const [i, user] of users.entries()) {
      unknown.push(await timed(uniqueEmail("ninguem"), `192.0.2.${i + 1}`));
      wrong.push(await timed(user.email, `192.0.2.${i + 101}`));
    }
    const ratio = median(unknown) / median(wrong);
    expect(ratio).toBeGreaterThan(1 / 3);
    expect(ratio).toBeLessThan(3);
  });
});

describe("US2 — limite de falhas por origem (FR-022)", () => {
  let t: TestApp;

  beforeAll(async () => {
    const base = testConfig();
    t = await createTestApp({
      config: { rateLimit: { ...base.rateLimit, loginOriginFailures: 6 } },
      overrides: [{ provide: LOGIN_DELAY, useValue: delaySpy().delay }],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  const login = (email: string, password: string, ip: string) =>
    api(t).post("/api/auth/login", { email, password }).set("X-Forwarded-For", ip);

  it("falhas de e-mails distintos pela mesma origem bloqueiam a origem; outra origem segue livre", async () => {
    const user = await createUser(t);
    for (let i = 0; i < 6; i += 1) expect((await login(uniqueEmail(`chute${i}`), WRONG, IP_A)).status).toBe(401);

    const blocked = await login(user.email, user.password, IP_A);
    expect(blocked.status).toBe(429);
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "auth.rate_limit.blocked" } });
    expect(event.metadata).toEqual({ scope: "login_origin" });

    expect((await login(user.email, user.password, IP_B)).status).toBe(200);
  });
});
