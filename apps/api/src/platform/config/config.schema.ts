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

/** A DNS name such as `devtrack.app` (at least two labels), the right side of our Message-ID (017 research N5). */
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** Resend signing secret (017 research N7): `whsec_` and the base64 key, which signs the notices. */
const resendSecret = z
  .string()
  .trim()
  .regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/, "must be whsec_<base64>")
  .refine((value) => Buffer.from(value.slice("whsec_".length), "base64").length >= 16, {
    message: "precisa ter ao menos 16 bytes após decodificação base64",
  })
  .transform((value) => Buffer.from(value.slice("whsec_".length), "base64"));

/** SNS topic of the SES notices (017 research N7). */
const snsTopicArn = z
  .string()
  .trim()
  .regex(/^arn:aws[a-z-]*:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,256}$/, "must be an SNS topic ARN");

/** Domain of `MAIL_FROM` (`Nome <a@b.c>` or `a@b.c`); null when it has none. */
export function mailFromDomain(mailFrom: string): string | null {
  const address = /<([^<>]+)>\s*$/.exec(mailFrom)?.[1] ?? mailFrom;
  const domain = address.trim().split("@")[1]?.toLowerCase() ?? "";
  return address.trim().split("@").length === 2 && DOMAIN.test(domain) ? domain : null;
}

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
  RATE_LIMIT_EXERCISE_AI_PER_HOUR: positiveInt(10),
  RATE_LIMIT_WORK_AI_PER_HOUR: positiveInt(10),
  RATE_LIMIT_ACTIVITY_SAVES_PER_MINUTE: positiveInt(60),
  RATE_LIMIT_ACTIVITY_SUBMITS_PER_HOUR: positiveInt(20),
  RATE_LIMIT_ACTIVITY_TEACHER_WRITES_PER_HOUR: positiveInt(300),
  RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR: positiveInt(60),
  AI_AGENT_EXECUTIONS_PER_HOUR: positiveInt(100),
  RATE_LIMIT_ATTEMPT_EVENTS_PER_MINUTE: positiveInt(120),
  RATE_LIMIT_WORK_HELP_PER_HOUR: positiveInt(20),
  AI_WORK_HELP_EXECUTIONS_PER_HOUR: positiveInt(1500),
  RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR: positiveInt(20),
  CONTROLLED_TYPING_BURST_CHARS: positiveInt(400),
  CONTROLLED_TYPING_CHARS_PER_SECOND: positiveInt(15),
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
  OPENROUTER_TIMEOUT_MS: positiveInt(60_000),
  // 009: observable budgets only; reaching one warns and audits, never blocks (spec Q3).
  AI_BUDGET_DAILY_USD: optional(decimalAmount),
  AI_BUDGET_MONTHLY_USD: optional(decimalAmount),
  AI_BUDGET_PER_USER_MONTHLY_USD: optional(decimalAmount),
  AI_BUDGET_PER_AGENT_MONTHLY_USD: optional(decimalAmount),
  // 017 (contracts/configuration.md): the outbox, provider notices and retention.
  MAIL_REPLY_TO: optional(z.email()),
  MAIL_MESSAGE_ID_DOMAIN: optional(z.string().trim().toLowerCase().regex(DOMAIN, "must be a domain")),
  MAIL_SENDS_PER_MINUTE: nonNegativeInt(120),
  MAIL_SEND_TIMEOUT_SECONDS: positiveInt(20),
  MAIL_NOTICE_PROVIDER: z.enum(["resend", "ses", "none"]).default("none"),
  MAIL_NOTICE_SECRET: optional(resendSecret),
  MAIL_SES_TOPIC_ARN: optional(snsTopicArn),
  RATE_LIMIT_MAIL_NOTICES_PER_MINUTE: positiveInt(600),
  MAIL_RECORDS_RETENTION_DAYS: positiveInt(180),
}).superRefine((e, ctx) => {
  if (e.MAIL_NOTICE_PROVIDER === "resend" && !e.MAIL_NOTICE_SECRET) {
    ctx.addIssue({ code: "custom", path: ["MAIL_NOTICE_SECRET"], message: "obrigatória com MAIL_NOTICE_PROVIDER=resend" });
  }
  if (e.MAIL_NOTICE_PROVIDER === "ses" && !e.MAIL_SES_TOPIC_ARN) {
    ctx.addIssue({ code: "custom", path: ["MAIL_SES_TOPIC_ARN"], message: "obrigatória com MAIL_NOTICE_PROVIDER=ses" });
  }
  if (!e.MAIL_MESSAGE_ID_DOMAIN && !mailFromDomain(e.MAIL_FROM)) {
    ctx.addIssue({ code: "custom", path: ["MAIL_MESSAGE_ID_DOMAIN"], message: "MAIL_FROM sem domínio: informe o domínio" });
  }
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
  /**
   * Production e-mail (017 contracts/configuration.md): reply address, the domain of our
   * Message-ID (research N5), the send cap of all instances per minute (`0` pauses sending, N4),
   * the SMTP timeout per message (N8), how long final deliveries are kept, and the provider whose
   * notices are accepted (N6, N7) with its secret or topic. The secret is never logged.
   */
  mail: {
    replyTo: string | null;
    messageIdDomain: string;
    sendsPerMinute: number;
    sendTimeoutMs: number;
    recordsRetentionDays: number;
    notices:
      | { provider: "none" }
      | { provider: "resend"; secret: Buffer }
      | { provider: "ses"; topicArn: string };
  };
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
    /** Exercise generation (010 research X19): batches requested per teacher per hour. */
    exerciseAiPerHour: number;
    /** Work generation (011 research W18): requests per teacher per hour. */
    workAiPerHour: number;
    /** Class activities (012 research P20): answer saves per student per minute. */
    activitySavesPerMinute: number;
    /** Starts and submissions per student per hour. */
    activitySubmitsPerHour: number;
    /** Every teacher write of 012 (apply, edit, close, cancel, grade, accept, release) per teacher per hour. */
    activityTeacherWritesPerHour: number;
    /** EXERCISE practice (013 research K16): start, retry and complete per student per hour. */
    exerciseAttemptsPerHour: number;
    /** Executions per agent per hour, all users together (008 research G9). */
    aiAgentPerHour: number;
    /** Controlled mode (015 research F4): focus and clipboard events per student per minute. */
    attemptEventsPerMinute: number;
    /** AI help (015 research F12): help requests per student per hour, any outcome. */
    workHelpPerHour: number;
    /** Hourly limit of the `work-helper` agent, all students together, in place of `aiAgentPerHour` (F12). */
    workHelpAgentPerHour: number;
    /** Room exits a student declares (016 research M11), per student per hour. */
    attemptPausesPerHour: number;
    /** Provider notices (017 research N6): requests per IP per minute on `POST /mail/notices/:provider`. */
    mailNoticesPerMinute: number;
  };
  /**
   * Controlled mode (015 research F7): an answer may grow `typingBurstChars` in one save plus
   * `typingCharsPerSecond` for every second since its last save; more is refused as pasted.
   */
  controlledMode: { typingBurstChars: number; typingCharsPerSecond: number };
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
     * only for the local E2E mock. The models come from the catalog in code (009 research H2);
     * `timeoutMs` is the ceiling of each catalog entry's. The key is never logged.
     */
    openrouter: {
      apiKey: string | null;
      baseUrl: string | null;
      timeoutMs: number;
    };
    /**
     * Names of removed variables still set in the environment (009 contracts/configuration.md:
     * `OPENROUTER_DEFAULT_MODEL`, `OPENROUTER_FALLBACK_MODEL`): ignored, logged `ai.config_ignored`.
     */
    ignoredVariables: string[];
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
/** Models come from the catalog since 009; a value still set is ignored (contracts/configuration.md). */
const REMOVED_AI_VARIABLES = ["OPENROUTER_DEFAULT_MODEL", "OPENROUTER_FALLBACK_MODEL"];

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
    mail: {
      replyTo: e.MAIL_REPLY_TO ?? null,
      // The schema refused a MAIL_FROM without a domain when no MAIL_MESSAGE_ID_DOMAIN is set.
      messageIdDomain: e.MAIL_MESSAGE_ID_DOMAIN ?? (mailFromDomain(e.MAIL_FROM) as string),
      sendsPerMinute: e.MAIL_SENDS_PER_MINUTE,
      sendTimeoutMs: e.MAIL_SEND_TIMEOUT_SECONDS * 1000,
      recordsRetentionDays: e.MAIL_RECORDS_RETENTION_DAYS,
      notices: noticeConfig(e),
    },
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
      exerciseAiPerHour: e.RATE_LIMIT_EXERCISE_AI_PER_HOUR,
      workAiPerHour: e.RATE_LIMIT_WORK_AI_PER_HOUR,
      activitySavesPerMinute: e.RATE_LIMIT_ACTIVITY_SAVES_PER_MINUTE,
      activitySubmitsPerHour: e.RATE_LIMIT_ACTIVITY_SUBMITS_PER_HOUR,
      activityTeacherWritesPerHour: e.RATE_LIMIT_ACTIVITY_TEACHER_WRITES_PER_HOUR,
      exerciseAttemptsPerHour: e.RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR,
      aiAgentPerHour: e.AI_AGENT_EXECUTIONS_PER_HOUR,
      attemptEventsPerMinute: e.RATE_LIMIT_ATTEMPT_EVENTS_PER_MINUTE,
      workHelpPerHour: e.RATE_LIMIT_WORK_HELP_PER_HOUR,
      workHelpAgentPerHour: e.AI_WORK_HELP_EXECUTIONS_PER_HOUR,
      attemptPausesPerHour: e.RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR,
      mailNoticesPerMinute: e.RATE_LIMIT_MAIL_NOTICES_PER_MINUTE,
    },
    controlledMode: {
      typingBurstChars: e.CONTROLLED_TYPING_BURST_CHARS,
      typingCharsPerSecond: e.CONTROLLED_TYPING_CHARS_PER_SECOND,
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
        timeoutMs: e.OPENROUTER_TIMEOUT_MS,
      },
      ignoredVariables: REMOVED_AI_VARIABLES.filter((name) => (env[name] ?? "").trim() !== ""),
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

function noticeConfig(e: ParsedEnv): AppConfig["mail"]["notices"] {
  // The schema refused `resend` without a secret and `ses` without a topic.
  if (e.MAIL_NOTICE_PROVIDER === "resend") return { provider: "resend", secret: e.MAIL_NOTICE_SECRET as Buffer };
  if (e.MAIL_NOTICE_PROVIDER === "ses") return { provider: "ses", topicArn: e.MAIL_SES_TOPIC_ARN as string };
  return { provider: "none" };
}
