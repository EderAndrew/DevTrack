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
