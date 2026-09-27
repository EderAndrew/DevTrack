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
/** An optional variable where an empty string (`KEY=` in .env) means "not set". */
/** A positive decimal amount of money (USD), kept as a string so no precision is lost (009 research H16). */
const decimalAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "must be a decimal number")
  .refine((value) => Number(value) > 0, "must be greater than zero");

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

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
  RATE_LIMIT_CLASS_INVITE_RESEND_SECONDS: positiveInt(60),
  RATE_LIMIT_CLASS_INVITE_DAILY_SENDS: positiveInt(5),
  RATE_LIMIT_CLASS_INVITE_TEACHER_HOURLY: positiveInt(50),
  RATE_LIMIT_SYLLABUS_UPLOADS_HOURLY: positiveInt(20),
  RATE_LIMIT_SYLLABUS_RETRIES_HOURLY: positiveInt(10),
  RATE_LIMIT_AI_EXECUTIONS_PER_MINUTE: positiveInt(10),
  RATE_LIMIT_AI_DECISIONS_PER_MINUTE: positiveInt(30),
  RATE_LIMIT_CURRICULUM_AI_PER_HOUR: positiveInt(10),
  AI_AGENT_EXECUTIONS_PER_HOUR: positiveInt(100),
  MAINTENANCE_INTERVAL_SECONDS: nonNegativeInt(3600),
  MAIL_RETRY_INTERVAL_SECONDS: nonNegativeInt(30),
  SYLLABUS_MAX_FILE_MB: positiveInt(10),
  SYLLABUS_PROCESSING_INTERVAL_SECONDS: nonNegativeInt(10),
  SYLLABUS_PROCESSING_TIMEOUT_SECONDS: positiveInt(120),
  AI_EXECUTION_INTERVAL_SECONDS: nonNegativeInt(5),
  AI_EXECUTION_TOTAL_TIMEOUT_SECONDS: positiveInt(120),
  AI_MODEL_CALL_TIMEOUT_SECONDS: positiveInt(60),
  AI_TOOL_TIMEOUT_SECONDS: positiveInt(10),
  AI_MAX_MODEL_CALLS: positiveInt(5),
  AI_MAX_TOOL_CALLS: positiveInt(10),
  AI_MAX_RETRIES: nonNegativeInt(2),
  AI_MAX_INPUT_KB: positiveInt(200),
  AI_MAX_OUTPUT_KB: positiveInt(200),
  AI_PROPOSAL_TTL_DAYS: positiveInt(30),
  AI_RECORD_RETENTION_DAYS: positiveInt(365),
  AI_CIRCUIT_FAILURE_THRESHOLD: positiveInt(5),
  AI_CIRCUIT_OPEN_SECONDS: positiveInt(60),
  OPENROUTER_API_KEY: optional(z.string().trim().min(1)),
  OPENROUTER_BASE_URL: optional(z.url({ protocol: /^https?$/ })),
  // Only trimmed here: an invalid model id leaves the task unavailable instead of stopping
  // the API (008 research G16), so the format is checked where the model configs are built.
  OPENROUTER_DEFAULT_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().default("anthropic/claude-opus-5"),
  ),
  OPENROUTER_FALLBACK_MODEL: optional(z.string().trim().min(1)),
  OPENROUTER_TIMEOUT_MS: positiveInt(60_000),
  // 009: observable budgets only; reaching one warns and audits, never blocks (spec Q3).
  AI_BUDGET_DAILY_USD: optional(decimalAmount),
  AI_BUDGET_MONTHLY_USD: optional(decimalAmount),
  AI_BUDGET_PER_USER_MONTHLY_USD: optional(decimalAmount),
  AI_BUDGET_PER_AGENT_MONTHLY_USD: optional(decimalAmount),
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
    /** Class invitations (FR-021, D6): resend spacing per invitation, sends per invitation per 24 h, sends per teacher per hour. */
    classInviteResendSeconds: number;
    classInviteDailySends: number;
    classInviteTeacherHourly: number;
    /** Syllabus (E20): uploads and "Tentar novamente" per teacher per hour. */
    syllabusUploadsHourly: number;
    syllabusRetriesHourly: number;
    /** AI (006 research A17): execution requests and proposal decisions per user per minute. */
    aiExecutionsPerMinute: number;
    aiDecisionsPerMinute: number;
    /** Curriculum Agent (007 research C13): "Preencher com IA" requests per teacher per hour. */
    curriculumAiPerHour: number;
    /** Executions per agent per hour, all users together (008 research G9). */
    aiAgentPerHour: number;
  };
  maintenanceIntervalSeconds: number;
  /** Class invitation delivery retry worker interval (FR-019, D5); 0 disables it. */
  mailRetryIntervalSeconds: number;
  /** Syllabus documents (E20): upload size limit, processing worker interval (0 disables it, kick() included) and per-attempt extraction timeout. */
  syllabus: { maxFileMb: number; processingIntervalSeconds: number; processingTimeoutSeconds: number };
  /**
   * AI foundation (006 research A17): execution worker interval (0 disables it, kick() included —
   * the global kill switch), per-execution limits, proposal validity and record retention.
   */
  ai: {
    intervalSeconds: number;
    limits: AiExecutionLimits;
    proposalTtlDays: number;
    retentionDays: number;
    /**
     * OpenRouter provider (008 research G10, G16). Without `apiKey` the provider is not
     * registered and AI is unavailable, while the app starts normally (FR-003). `baseUrl` is
     * only for the local E2E mock. The models are checked where the model configs are built.
     * The key is never logged.
     */
    openrouter: {
      apiKey: string | null;
      baseUrl: string | null;
      defaultModel: string;
      fallbackModel: string | null;
      timeoutMs: number;
    };
    /** Circuit breaker per model config (008 research G8). */
    circuit: { failureThreshold: number; openSeconds: number };
    /**
     * Budgets in USD as decimal strings (009 research H16); null = no budget. Only observed:
     * reaching one warns in "Operação de IA" and audits `ai_budget.exceeded` once per period.
     */
    budgets: { daily: string | null; monthly: string | null; perUserMonthly: string | null; perAgentMonthly: string | null };
  };
  /** Argon2id parameters (OWASP minimum, R4). Not configurable through env on purpose. */
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
}

/** Global limits of an AI execution; an agent may only lower them (006 research A17). */
export interface AiExecutionLimits {
  totalTimeoutMs: number;
  modelCallTimeoutMs: number;
  toolTimeoutMs: number;
  maxModelCalls: number;
  maxToolCalls: number;
  maxRetries: number;
  maxInputBytes: number;
  maxOutputBytes: number;
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
      classInviteResendSeconds: e.RATE_LIMIT_CLASS_INVITE_RESEND_SECONDS,
      classInviteDailySends: e.RATE_LIMIT_CLASS_INVITE_DAILY_SENDS,
      classInviteTeacherHourly: e.RATE_LIMIT_CLASS_INVITE_TEACHER_HOURLY,
      syllabusUploadsHourly: e.RATE_LIMIT_SYLLABUS_UPLOADS_HOURLY,
      syllabusRetriesHourly: e.RATE_LIMIT_SYLLABUS_RETRIES_HOURLY,
      aiExecutionsPerMinute: e.RATE_LIMIT_AI_EXECUTIONS_PER_MINUTE,
      aiDecisionsPerMinute: e.RATE_LIMIT_AI_DECISIONS_PER_MINUTE,
      curriculumAiPerHour: e.RATE_LIMIT_CURRICULUM_AI_PER_HOUR,
      aiAgentPerHour: e.AI_AGENT_EXECUTIONS_PER_HOUR,
    },
    maintenanceIntervalSeconds: e.MAINTENANCE_INTERVAL_SECONDS,
    mailRetryIntervalSeconds: e.MAIL_RETRY_INTERVAL_SECONDS,
    syllabus: {
      maxFileMb: e.SYLLABUS_MAX_FILE_MB,
      processingIntervalSeconds: e.SYLLABUS_PROCESSING_INTERVAL_SECONDS,
      processingTimeoutSeconds: e.SYLLABUS_PROCESSING_TIMEOUT_SECONDS,
    },
    ai: {
      intervalSeconds: e.AI_EXECUTION_INTERVAL_SECONDS,
      limits: {
        totalTimeoutMs: e.AI_EXECUTION_TOTAL_TIMEOUT_SECONDS * 1000,
        modelCallTimeoutMs: e.AI_MODEL_CALL_TIMEOUT_SECONDS * 1000,
        toolTimeoutMs: e.AI_TOOL_TIMEOUT_SECONDS * 1000,
        maxModelCalls: e.AI_MAX_MODEL_CALLS,
        maxToolCalls: e.AI_MAX_TOOL_CALLS,
        maxRetries: e.AI_MAX_RETRIES,
        maxInputBytes: e.AI_MAX_INPUT_KB * 1024,
        maxOutputBytes: e.AI_MAX_OUTPUT_KB * 1024,
      },
      proposalTtlDays: e.AI_PROPOSAL_TTL_DAYS,
      retentionDays: e.AI_RECORD_RETENTION_DAYS,
      openrouter: {
        apiKey: e.OPENROUTER_API_KEY ?? null,
        baseUrl: e.OPENROUTER_BASE_URL ?? null,
        defaultModel: e.OPENROUTER_DEFAULT_MODEL,
        fallbackModel: e.OPENROUTER_FALLBACK_MODEL ?? null,
        timeoutMs: e.OPENROUTER_TIMEOUT_MS,
      },
      circuit: { failureThreshold: e.AI_CIRCUIT_FAILURE_THRESHOLD, openSeconds: e.AI_CIRCUIT_OPEN_SECONDS },
      budgets: {
        daily: e.AI_BUDGET_DAILY_USD ?? null,
        monthly: e.AI_BUDGET_MONTHLY_USD ?? null,
        perUserMonthly: e.AI_BUDGET_PER_USER_MONTHLY_USD ?? null,
        perAgentMonthly: e.AI_BUDGET_PER_AGENT_MONTHLY_USD ?? null,
      },
    },
    argon2: { memoryCost: 19_456, timeCost: 2, parallelism: 1 },
  };
}
