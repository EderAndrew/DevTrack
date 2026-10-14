import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvalidConfigError, loadConfig } from "../../src/platform/config/config.schema";
import { api, createTestApp, testConfig, type TestApp } from "../helpers/test-app";

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

  it.each([
    ["RATE_LIMIT_EXAM_DECISIONS_PER_MINUTE", "examDecisionsPerMinute", 60],
    ["RATE_LIMIT_EXAM_GENERATIONS_PER_HOUR", "examGenerationsPerHour", 10],
  ] as const)("018 %s: %s is %i by default, configurable, and a value that is not positive stops the startup", (variable, key, fallback) => {
    const env = { ...process.env };
    delete env[variable];
    expect(loadConfig(env).rateLimit[key]).toBe(fallback);
    expect(loadConfig({ ...env, [variable]: "3" }).rateLimit[key]).toBe(3);
    for (const value of ["0", "-1", "1.5"]) {
      expect(failure({ ...env, [variable]: value }).variables).toEqual([variable]);
    }
  });

  describe("017/FR-023 e-mail configuration", () => {
    const MAIL_VARIABLES = [
      "MAIL_REPLY_TO",
      "MAIL_MESSAGE_ID_DOMAIN",
      "MAIL_SENDS_PER_MINUTE",
      "MAIL_SEND_TIMEOUT_SECONDS",
      "MAIL_NOTICE_PROVIDER",
      "MAIL_NOTICE_SECRET",
      "MAIL_SES_TOPIC_ARN",
      "RATE_LIMIT_MAIL_NOTICES_PER_MINUTE",
      "MAIL_RECORDS_RETENTION_DAYS",
    ];
    const SECRET = "whsec_ZGV2dHJhY2stdGVzdC1tYWlsLW5vdGljZS1zZWNyZXQ=";
    const ARN = "arn:aws:sns:sa-east-1:123456789012:devtrack-mail";
    const bare = (): NodeJS.ProcessEnv => {
      const env: NodeJS.ProcessEnv = { ...process.env, MAIL_FROM: "DevTrack <nao-responda@Mail.DevTrack.app>" };
      for (const variable of MAIL_VARIABLES) delete env[variable];
      return env;
    };

    it("017/FR-023 defaults: no reply address, Message-ID on the domain of MAIL_FROM, 120 sends/min, 20 s, no notice provider, 600 notices/min, 180 days", () => {
      const config = loadConfig(bare());
      expect(config.mail).toEqual({
        replyTo: null,
        messageIdDomain: "mail.devtrack.app",
        sendsPerMinute: 120,
        sendTimeoutMs: 20_000,
        recordsRetentionDays: 180,
        notices: { provider: "none" },
      });
      expect(config.rateLimit.mailNoticesPerMinute).toBe(600);
      expect(loadConfig({ ...bare(), MAIL_FROM: "nao-responda@devtrack.app" }).mail.messageIdDomain).toBe("devtrack.app");
    });

    it("017/FR-023 every variable is configurable; MAIL_SENDS_PER_MINUTE=0 pauses sending", () => {
      const config = loadConfig({
        ...bare(),
        MAIL_REPLY_TO: "contato@devtrack.app",
        MAIL_MESSAGE_ID_DOMAIN: "Envio.DevTrack.app",
        MAIL_SENDS_PER_MINUTE: "0",
        MAIL_SEND_TIMEOUT_SECONDS: "5",
        RATE_LIMIT_MAIL_NOTICES_PER_MINUTE: "30",
        MAIL_RECORDS_RETENTION_DAYS: "30",
      });
      expect(config.mail).toMatchObject({
        replyTo: "contato@devtrack.app",
        messageIdDomain: "envio.devtrack.app",
        sendsPerMinute: 0,
        sendTimeoutMs: 5_000,
        recordsRetentionDays: 30,
      });
      expect(config.rateLimit.mailNoticesPerMinute).toBe(30);
    });

    it("017/FR-023 notice provider: resend with its decoded secret, ses with its topic", () => {
      const resend = loadConfig({ ...bare(), MAIL_NOTICE_PROVIDER: "resend", MAIL_NOTICE_SECRET: SECRET }).mail.notices;
      expect(resend).toEqual({ provider: "resend", secret: Buffer.from("devtrack-test-mail-notice-secret") });
      const ses = loadConfig({ ...bare(), MAIL_NOTICE_PROVIDER: "ses", MAIL_SES_TOPIC_ARN: ARN }).mail.notices;
      expect(ses).toEqual({ provider: "ses", topicArn: ARN });
    });

    it("017/FR-023 refuses negative or fractional numbers, a bad reply address and an unknown provider", () => {
      const cases: Array<[string, string]> = [
        ["MAIL_SENDS_PER_MINUTE", "-1"],
        ["MAIL_SENDS_PER_MINUTE", "1.5"],
        ["MAIL_SEND_TIMEOUT_SECONDS", "0"],
        ["MAIL_SEND_TIMEOUT_SECONDS", "-1"],
        ["RATE_LIMIT_MAIL_NOTICES_PER_MINUTE", "0"],
        ["MAIL_RECORDS_RETENTION_DAYS", "0"],
        ["MAIL_RECORDS_RETENTION_DAYS", "-5"],
        ["MAIL_REPLY_TO", "nao-e-email"],
        ["MAIL_MESSAGE_ID_DOMAIN", "sem_dominio"],
        ["MAIL_NOTICE_PROVIDER", "sendgrid"],
      ];
      for (const [variable, value] of cases) {
        expect(failure({ ...bare(), [variable]: value }).variables).toEqual([variable]);
      }
    });

    it("017/FR-023 refuses resend without a secret, ses without a topic, and a malformed secret or topic", () => {
      expect(failure({ ...bare(), MAIL_NOTICE_PROVIDER: "resend" }).variables).toEqual(["MAIL_NOTICE_SECRET"]);
      expect(failure({ ...bare(), MAIL_NOTICE_PROVIDER: "ses" }).variables).toEqual(["MAIL_SES_TOPIC_ARN"]);
      for (const secret of ["ZGV2dHJhY2stdGVzdC1tYWlsLW5vdGljZS1zZWNyZXQ=", "whsec_", "whsec_não-base64!", "whsec_c2hvcnQ="]) {
        const error = failure({ ...bare(), MAIL_NOTICE_PROVIDER: "resend", MAIL_NOTICE_SECRET: secret });
        expect(error.variables).toEqual(["MAIL_NOTICE_SECRET"]);
        expect(error.message).not.toContain(secret);
      }
      for (const arn of ["devtrack-mail", "arn:aws:sqs:sa-east-1:123456789012:devtrack-mail", "arn:aws:sns:sa-east-1:123:x"]) {
        expect(failure({ ...bare(), MAIL_NOTICE_PROVIDER: "ses", MAIL_SES_TOPIC_ARN: arn }).variables).toEqual(["MAIL_SES_TOPIC_ARN"]);
      }
    });

    it("017/FR-023 a MAIL_FROM without a domain needs MAIL_MESSAGE_ID_DOMAIN", () => {
      expect(failure({ ...bare(), MAIL_FROM: "DevTrack <nao-responda>" }).variables).toEqual(["MAIL_MESSAGE_ID_DOMAIN"]);
      const config = loadConfig({ ...bare(), MAIL_FROM: "DevTrack <nao-responda>", MAIL_MESSAGE_ID_DOMAIN: "devtrack.app" });
      expect(config.mail.messageIdDomain).toBe("devtrack.app");
    });

    it("017/FR-023 the test environment accepts Resend notices with the fixed test secret", () => {
      expect(loadConfig(process.env).mail.notices.provider).toBe("resend");
    });
  });

  describe("019 Code Runner configuration (contracts/configuration.md)", () => {
    const CODE_RUNNER_VARIABLES = [
      "CODE_RUNNER_ENABLED",
      "RATE_LIMIT_CODE_RUNS_PER_MINUTE",
      "CODE_RUN_QUEUE_DEADLINE_SECONDS",
      "CODE_RUNNER_STALE_SECONDS",
      "CODE_RUN_CONTENT_RETENTION_HOURS",
      "CODE_RUNNER_CONCURRENCY",
      "CODE_RUNNER_POLL_MS",
      "CODE_RUNNER_LEASE_SECONDS",
      "CODE_RUNNER_DOCKER_RUNTIME",
      "CODE_RUNNER_TIME_LIMIT_MS",
      "CODE_RUNNER_COMPILE_LIMIT_MS",
      "CODE_RUNNER_MEMORY_MB",
      "CODE_RUNNER_OUTPUT_LIMIT_BYTES",
      "CODE_RUNNER_PIDS_LIMIT",
    ];
    const bare = (): NodeJS.ProcessEnv => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const variable of CODE_RUNNER_VARIABLES) delete env[variable];
      return env;
    };
    /** A production environment that passes the 017 mail guard, so only the 019 guard decides. */
    const production = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
      ...bare(),
      NODE_ENV: "production",
      SMTP_URL: "smtps://resend:senha@smtp.resend.com:465",
      MAIL_FROM: "DevTrack <nao-responda@devtrack.app>",
      MAIL_NOTICE_PROVIDER: "resend",
      MAIL_NOTICE_SECRET: "whsec_ZGV2dHJhY2stdGVzdC1tYWlsLW5vdGljZS1zZWNyZXQ=",
      ...env,
    });

    it("019 defaults: off outside production unless set, 10 runs/min, 60 s queue, 15 s heartbeat, 24 h content, runc and the B3 limits", () => {
      const config = loadConfig(bare());
      expect(config.codeRunner).toEqual({
        enabled: false,
        queueDeadlineSeconds: 60,
        staleSeconds: 15,
        contentRetentionHours: 24,
        worker: {
          concurrency: 2,
          pollMs: 500,
          leaseSeconds: 90,
          dockerRuntime: "runc",
          timeLimitMs: 2000,
          compileLimitMs: 10_000,
          memoryMb: 256,
          outputLimitBytes: 65_536,
          pidsLimit: 128,
        },
      });
      expect(config.rateLimit.codeRunsPerMinute).toBe(10);
    });

    it("019 every variable is configurable; CODE_RUNNER_ENABLED takes true or false", () => {
      const config = loadConfig({
        ...bare(),
        CODE_RUNNER_ENABLED: "true",
        RATE_LIMIT_CODE_RUNS_PER_MINUTE: "3",
        CODE_RUN_QUEUE_DEADLINE_SECONDS: "30",
        CODE_RUNNER_STALE_SECONDS: "20",
        CODE_RUN_CONTENT_RETENTION_HOURS: "12",
        CODE_RUNNER_CONCURRENCY: "4",
        CODE_RUNNER_POLL_MS: "250",
        CODE_RUNNER_LEASE_SECONDS: "120",
        CODE_RUNNER_DOCKER_RUNTIME: "runsc",
        CODE_RUNNER_TIME_LIMIT_MS: "3000",
        CODE_RUNNER_COMPILE_LIMIT_MS: "15000",
        CODE_RUNNER_MEMORY_MB: "512",
        CODE_RUNNER_OUTPUT_LIMIT_BYTES: "1024",
        CODE_RUNNER_PIDS_LIMIT: "64",
      });
      expect(config.codeRunner).toEqual({
        enabled: true,
        queueDeadlineSeconds: 30,
        staleSeconds: 20,
        contentRetentionHours: 12,
        worker: {
          concurrency: 4,
          pollMs: 250,
          leaseSeconds: 120,
          dockerRuntime: "runsc",
          timeLimitMs: 3000,
          compileLimitMs: 15_000,
          memoryMb: 512,
          outputLimitBytes: 1024,
          pidsLimit: 64,
        },
      });
      expect(config.rateLimit.codeRunsPerMinute).toBe(3);
      expect(loadConfig({ ...bare(), CODE_RUNNER_ENABLED: "false" }).codeRunner.enabled).toBe(false);
      expect(loadConfig({ ...bare(), CODE_RUNNER_ENABLED: "" }).codeRunner.enabled).toBe(false);
    });

    it("019 refuses zero, negative or fractional numbers, an unknown runtime and a kill switch other than true/false", () => {
      for (const variable of CODE_RUNNER_VARIABLES.filter((name) => !["CODE_RUNNER_ENABLED", "CODE_RUNNER_DOCKER_RUNTIME"].includes(name))) {
        for (const value of ["0", "-1", "1.5", "dez"]) {
          expect(failure({ ...bare(), [variable]: value }).variables, `${variable}=${value}`).toEqual([variable]);
        }
      }
      for (const value of ["docker", "kata", "RUNSC"]) {
        expect(failure({ ...bare(), CODE_RUNNER_DOCKER_RUNTIME: value }).variables).toEqual(["CODE_RUNNER_DOCKER_RUNTIME"]);
      }
      for (const value of ["1", "yes", "TRUE", "on"]) {
        expect(failure({ ...bare(), CODE_RUNNER_ENABLED: value }).variables).toEqual(["CODE_RUNNER_ENABLED"]);
      }
    });

    it("019 production guard (research B10, B12): the kill switch must be set, and on it requires gVisor (runsc)", () => {
      expect(failure(production({})).variables).toEqual(["CODE_RUNNER_ENABLED"]);
      expect(failure(production({ CODE_RUNNER_ENABLED: "true" })).variables).toEqual(["CODE_RUNNER_DOCKER_RUNTIME"]);
      expect(failure(production({ CODE_RUNNER_ENABLED: "true", CODE_RUNNER_DOCKER_RUNTIME: "runc" })).variables).toEqual([
        "CODE_RUNNER_DOCKER_RUNTIME",
      ]);
      const on = loadConfig(production({ CODE_RUNNER_ENABLED: "true", CODE_RUNNER_DOCKER_RUNTIME: "runsc" }));
      expect(on.codeRunner).toMatchObject({ enabled: true, worker: { dockerRuntime: "runsc" } });
      expect(loadConfig(production({ CODE_RUNNER_ENABLED: "false" })).codeRunner.enabled).toBe(false);
      // Outside production runc is the development default (Docker Desktop has no gVisor).
      expect(loadConfig({ ...bare(), CODE_RUNNER_ENABLED: "true" }).codeRunner.worker.dockerRuntime).toBe("runc");
    });

    it("019 testConfig() turns the Code Runner on with the default limits (the suites use the FakeSandbox)", () => {
      const config = testConfig();
      expect(config.codeRunner.enabled).toBe(true);
      expect(config.codeRunner.worker.dockerRuntime).toBe("runc");
      expect(testConfig({ codeRunner: { ...config.codeRunner, enabled: false } }).codeRunner.enabled).toBe(false);
    });
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
