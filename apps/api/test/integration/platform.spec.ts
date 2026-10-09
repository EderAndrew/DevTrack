import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvalidConfigError, loadConfig } from "../../src/platform/config/config.schema";
import { api, createTestApp, type TestApp } from "../helpers/test-app";

describe("startup configuration (FR-074)", () => {
  const SECRET_DB_URL = "postgresql://devtrack:s3nh4-do-banco@db.internal:5432/devtrack";

  const failure = (env: NodeJS.ProcessEnv): InvalidConfigError => {
    try {
      loadConfig(env);
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConfigError);
      return error as InvalidConfigError;
    }
    throw new Error("expected loadConfig to fail");
  };

  it("fails listing APP_HMAC_SECRET and DATABASE_URL when missing", () => {
    const env = { ...process.env };
    delete env.APP_HMAC_SECRET;
    delete env.DATABASE_URL;
    const error = failure(env);
    expect(error.variables).toEqual(["APP_HMAC_SECRET", "DATABASE_URL"]);
    expect(error.message).toContain("APP_HMAC_SECRET");
    expect(error.message).toContain("DATABASE_URL");
  });

  it("never echoes values, even of invalid variables", () => {
    const env = { ...process.env, DATABASE_URL: "mysql://root:s3nh4@x/y", APP_HMAC_SECRET: "curto-demais" };
    const error = failure(env);
    expect(error.variables).toEqual(["APP_HMAC_SECRET", "DATABASE_URL"]);
    expect(error.message).not.toContain("s3nh4");
    expect(error.message).not.toContain("curto-demais");
    for (const value of Object.values(process.env)) {
      if (value && value.length > 8) expect(error.message).not.toContain(value);
    }
  });

  it("010/FR-024 RATE_LIMIT_EXERCISE_AI_PER_HOUR: 10 by default, configurable, and an invalid value stops the startup", () => {
    const env = { ...process.env };
    delete env.RATE_LIMIT_EXERCISE_AI_PER_HOUR;
    expect(loadConfig(env).rateLimit.exerciseAiPerHour).toBe(10);
    expect(loadConfig({ ...env, RATE_LIMIT_EXERCISE_AI_PER_HOUR: "3" }).rateLimit.exerciseAiPerHour).toBe(3);
    expect(failure({ ...env, RATE_LIMIT_EXERCISE_AI_PER_HOUR: "0" }).variables).toEqual(["RATE_LIMIT_EXERCISE_AI_PER_HOUR"]);
  });

  it("011 RATE_LIMIT_WORK_AI_PER_HOUR: 10 by default, configurable, and an invalid value stops the startup", () => {
    const env = { ...process.env };
    delete env.RATE_LIMIT_WORK_AI_PER_HOUR;
    expect(loadConfig(env).rateLimit.workAiPerHour).toBe(10);
    expect(loadConfig({ ...env, RATE_LIMIT_WORK_AI_PER_HOUR: "3" }).rateLimit.workAiPerHour).toBe(3);
    expect(failure({ ...env, RATE_LIMIT_WORK_AI_PER_HOUR: "0" }).variables).toEqual(["RATE_LIMIT_WORK_AI_PER_HOUR"]);
    expect(failure({ ...env, RATE_LIMIT_WORK_AI_PER_HOUR: "1.5" }).variables).toEqual(["RATE_LIMIT_WORK_AI_PER_HOUR"]);
  });

  it("012 activity rate limits: 60 saves/min, 20 submits/h and 300 teacher writes/h by default, configurable, invalid stops the startup", () => {
    const env = { ...process.env };
    delete env.RATE_LIMIT_ACTIVITY_SAVES_PER_MINUTE;
    delete env.RATE_LIMIT_ACTIVITY_SUBMITS_PER_HOUR;
    delete env.RATE_LIMIT_ACTIVITY_TEACHER_WRITES_PER_HOUR;
    const { rateLimit } = loadConfig(env);
    expect([rateLimit.activitySavesPerMinute, rateLimit.activitySubmitsPerHour, rateLimit.activityTeacherWritesPerHour]).toEqual([60, 20, 300]);
    const custom = loadConfig({
      ...env,
      RATE_LIMIT_ACTIVITY_SAVES_PER_MINUTE: "5",
      RATE_LIMIT_ACTIVITY_SUBMITS_PER_HOUR: "2",
      RATE_LIMIT_ACTIVITY_TEACHER_WRITES_PER_HOUR: "7",
    }).rateLimit;
    expect([custom.activitySavesPerMinute, custom.activitySubmitsPerHour, custom.activityTeacherWritesPerHour]).toEqual([5, 2, 7]);
    for (const variable of [
      "RATE_LIMIT_ACTIVITY_SAVES_PER_MINUTE",
      "RATE_LIMIT_ACTIVITY_SUBMITS_PER_HOUR",
      "RATE_LIMIT_ACTIVITY_TEACHER_WRITES_PER_HOUR",
    ]) {
      expect(failure({ ...env, [variable]: "0" }).variables).toEqual([variable]);
      expect(failure({ ...env, [variable]: "1.5" }).variables).toEqual([variable]);
    }
  });

  it("013 exercise attempt rate limit: 60 per student per hour by default, configurable, invalid stops the startup", () => {
    const env = { ...process.env };
    delete env.RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR;
    expect(loadConfig(env).rateLimit.exerciseAttemptsPerHour).toBe(60);
    expect(loadConfig({ ...env, RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR: "4" }).rateLimit.exerciseAttemptsPerHour).toBe(4);
    expect(failure({ ...env, RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR: "0" }).variables).toEqual(["RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR"]);
    expect(failure({ ...env, RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR: "1.5" }).variables).toEqual(["RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR"]);
  });

  it("015 controlled works and AI help: defaults of contracts/configuration.md, configurable, invalid stops the startup", () => {
    const env = { ...process.env };
    const variables = [
      "CONTROLLED_TYPING_BURST_CHARS",
      "CONTROLLED_TYPING_CHARS_PER_SECOND",
      "RATE_LIMIT_ATTEMPT_EVENTS_PER_MINUTE",
      "RATE_LIMIT_WORK_HELP_PER_HOUR",
      "AI_WORK_HELP_EXECUTIONS_PER_HOUR",
    ];
    for (const variable of variables) delete env[variable];
    const config = loadConfig(env);
    expect(config.controlledMode).toEqual({ typingBurstChars: 400, typingCharsPerSecond: 15 });
    expect(config.rateLimit.attemptEventsPerMinute).toBe(120);
    expect(config.rateLimit.workHelpPerHour).toBe(20);
    expect(config.rateLimit.workHelpAgentPerHour).toBe(1500);

    const custom = loadConfig({
      ...env,
      CONTROLLED_TYPING_BURST_CHARS: "200",
      CONTROLLED_TYPING_CHARS_PER_SECOND: "8",
      RATE_LIMIT_ATTEMPT_EVENTS_PER_MINUTE: "30",
      RATE_LIMIT_WORK_HELP_PER_HOUR: "5",
      AI_WORK_HELP_EXECUTIONS_PER_HOUR: "50",
    });
    expect(custom.controlledMode).toEqual({ typingBurstChars: 200, typingCharsPerSecond: 8 });
    expect(custom.rateLimit.attemptEventsPerMinute).toBe(30);
    expect(custom.rateLimit.workHelpPerHour).toBe(5);
    expect(custom.rateLimit.workHelpAgentPerHour).toBe(50);

    for (const variable of variables) {
      expect(failure({ ...env, [variable]: "0" }).variables).toEqual([variable]);
      expect(failure({ ...env, [variable]: "1.5" }).variables).toEqual([variable]);
    }
  });

  it("016 RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR: 20 by default, configurable, and an invalid value stops the startup", () => {
    const env = { ...process.env };
    delete env.RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR;
    expect(loadConfig(env).rateLimit.attemptPausesPerHour).toBe(20);
    expect(loadConfig({ ...env, RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR: "3" }).rateLimit.attemptPausesPerHour).toBe(3);
    for (const value of ["0", "-1", "1.5"]) {
      expect(failure({ ...env, RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR: value }).variables).toEqual(["RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR"]);
    }
  });

  it("accepts a complete environment", () => {
    const config = loadConfig({ ...process.env, DATABASE_URL: SECRET_DB_URL });
    expect(config.databaseUrl).toBe(SECRET_DB_URL);
    expect(config.hmacSecret.length).toBeGreaterThanOrEqual(32);
  });
});

describe("health endpoints", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it("GET /api/health/live → 200 without session", async () => {
    const res = await api(t).get("/api/health/live");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /api/health/ready → 200 without session when the database answers", async () => {
    const res = await api(t, { origin: null }).get("/api/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("unknown routes answer in the error catalogue format", async () => {
    const res = await api(t).get("/api/nao-existe");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
  });
});
