import { z } from "zod";

const httpOrigin = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin);

const originList = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    const origins: string[] = [];
    for (const raw of value.split(",")) {
      const entry = raw.trim();
      if (!entry) continue;
      const parsed = httpOrigin.safeParse(entry);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: "lista de URLs inválida" });
        return z.NEVER;
      }
      origins.push(parsed.data);
    }
    if (origins.length === 0) {
      ctx.addIssue({ code: "custom", message: "informe ao menos uma origem" });
      return z.NEVER;
    }
    return origins;
  });

const hmacSecret = z
  .string()
  .min(1)
  .refine((value) => Buffer.from(value, "base64").length >= 32, {
    message: "precisa ter ao menos 32 bytes após decodificação base64",
  })
  .transform((value) => Buffer.from(value, "base64"));

const nonNegativeInt = (fallback: number) => z.coerce.number().int().min(0).default(fallback);
const positiveInt = (fallback: number) => z.coerce.number().int().min(1).default(fallback);

export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_HMAC_SECRET: hmacSecret,
  WEB_ORIGIN: httpOrigin,
  ALLOWED_ORIGINS: originList,
  SMTP_URL: z.url({ protocol: /^smtps?$/ }),
  MAIL_FROM: z.string().trim().min(3),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10),
  RATE_LIMIT_LOGIN_EMAIL_ORIGIN_FAILURES: positiveInt(5),
  RATE_LIMIT_LOGIN_ORIGIN_FAILURES: positiveInt(100),
  RATE_LIMIT_PUBLIC_ORIGIN: positiveInt(300),
  RATE_LIMIT_PUBLIC_TARGET: positiveInt(5),
  RATE_LIMIT_WINDOW_SECONDS: positiveInt(900),
  MAINTENANCE_INTERVAL_SECONDS: nonNegativeInt(3600),
});

type ParsedEnv = z.output<typeof configSchema>;

export interface AppConfig {
  nodeEnv: ParsedEnv["NODE_ENV"];
  port: number;
  logLevel: ParsedEnv["LOG_LEVEL"];
  databaseUrl: string;
  hmacSecret: Buffer;
  webOrigin: string;
  allowedOrigins: string[];
  smtpUrl: string;
  mailFrom: string;
  trustProxyHops: number;
  rateLimit: {
    loginEmailOriginFailures: number;
    loginOriginFailures: number;
    publicOrigin: number;
    publicTarget: number;
    windowSeconds: number;
  };
  maintenanceIntervalSeconds: number;
  /** Argon2id parameters (OWASP minimum, R4). Not configurable through env on purpose. */
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
}

export class InvalidConfigError extends Error {
  constructor(readonly variables: string[]) {
    super(
      `Configuração inválida ou ausente: ${variables.join(", ")}. ` +
        "Revise o arquivo .env (veja .env.example).",
    );
    this.name = "InvalidConfigError";
  }
}

/**
 * Validates the environment before the application starts (FR-074). The error lists
 * only variable names — values are never echoed, since some of them are secrets.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].sort();
    throw new InvalidConfigError(variables);
  }
  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    hmacSecret: e.APP_HMAC_SECRET,
    webOrigin: e.WEB_ORIGIN,
    allowedOrigins: e.ALLOWED_ORIGINS,
    smtpUrl: e.SMTP_URL,
    mailFrom: e.MAIL_FROM,
    trustProxyHops: e.TRUST_PROXY_HOPS,
    rateLimit: {
      loginEmailOriginFailures: e.RATE_LIMIT_LOGIN_EMAIL_ORIGIN_FAILURES,
      loginOriginFailures: e.RATE_LIMIT_LOGIN_ORIGIN_FAILURES,
      publicOrigin: e.RATE_LIMIT_PUBLIC_ORIGIN,
      publicTarget: e.RATE_LIMIT_PUBLIC_TARGET,
      windowSeconds: e.RATE_LIMIT_WINDOW_SECONDS,
    },
    maintenanceIntervalSeconds: e.MAINTENANCE_INTERVAL_SECONDS,
    argon2: { memoryCost: 19_456, timeCost: 2, parallelism: 1 },
  };
}
