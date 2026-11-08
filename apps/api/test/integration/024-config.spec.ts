import { describe, expect, it } from "vitest";
import { InvalidConfigError, loadConfig } from "../../src/platform/config/config.schema";

const TOKEN = "MARCADOR-TOKEN-EXPO-024-abcdefghij";

/** A production environment that passes the 017 and 019 guards (017-us4-config.spec.ts). */
const production = (env: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    SMTP_URL: "smtps://resend:senha@smtp.resend.com:465",
    MAIL_FROM: "DevTrack <nao-responda@devtrack.app>",
    MAIL_NOTICE_PROVIDER: "resend",
    MAIL_NOTICE_SECRET: "whsec_ZGV2dHJhY2stdGVzdC1tYWlsLW5vdGljZS1zZWNyZXQ=",
    CODE_RUNNER_ENABLED: "false",
  };
  for (const name of ["MAIL_MESSAGE_ID_DOMAIN", "PUSH_ENABLED", "EXPO_ACCESS_TOKEN", "EXPO_PUSH_BASE_URL", "EXAM_ALERT_INTERVAL_MS", "EXAM_ALERT_MAX_AGE_SECONDS"]) {
    delete base[name];
  }
  return { ...base, ...env };
};

const failure = (env: NodeJS.ProcessEnv): InvalidConfigError => {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidConfigError);
    return error as InvalidConfigError;
  }
  throw new Error("the configuration was accepted");
};

/** 024 contracts/configuration.md: the push settings, validated at startup like every other variable. */
describe("024 configuração dos avisos por push", () => {
  it("024/FR-015 sem nada configurado o envio fica desligado, com o Expo como destino e o intervalo de 1 s", () => {
    const config = loadConfig(production());
    expect(config.push).toEqual({ enabled: false, accessToken: null, baseUrl: "https://exp.host", alertIntervalMs: 1000, alertMaxAgeSeconds: 60 });
    expect(config.rateLimit.mobileWritesPerMinute).toBe(30);
  });

  it("ligar o envio exige o token de acesso do Expo; o erro cita só o nome da variável", () => {
    expect(failure(production({ PUSH_ENABLED: "true" })).variables).toEqual(["EXPO_ACCESS_TOKEN"]);
    const error = failure(production({ PUSH_ENABLED: "true", EXPO_ACCESS_TOKEN: "curto" }));
    expect(error.variables).toEqual(["EXPO_ACCESS_TOKEN"]);
    expect(error.message).not.toContain("curto");
    const config = loadConfig(production({ PUSH_ENABLED: "true", EXPO_ACCESS_TOKEN: TOKEN }));
    expect(config.push).toMatchObject({ enabled: true, accessToken: TOKEN });
  });

  it("em produção o destino do push é sempre https; fora dela o harness pode apontar para um fake local", () => {
    expect(failure(production({ EXPO_PUSH_BASE_URL: "http://127.0.0.1:9999" })).variables).toEqual(["EXPO_PUSH_BASE_URL"]);
    expect(loadConfig({ ...process.env, NODE_ENV: "test", EXPO_PUSH_BASE_URL: "http://127.0.0.1:9999/x" }).push.baseUrl).toBe("http://127.0.0.1:9999");
  });

  it("valores fora do formato são recusados pelo nome", () => {
    expect(failure(production({ PUSH_ENABLED: "sim" })).variables).toEqual(["PUSH_ENABLED"]);
    expect(failure(production({ EXAM_ALERT_INTERVAL_MS: "-1" })).variables).toEqual(["EXAM_ALERT_INTERVAL_MS"]);
    expect(failure(production({ EXAM_ALERT_MAX_AGE_SECONDS: "0" })).variables).toEqual(["EXAM_ALERT_MAX_AGE_SECONDS"]);
    expect(loadConfig(production({ EXAM_ALERT_INTERVAL_MS: "0" })).push.alertIntervalMs).toBe(0);
  });
});
