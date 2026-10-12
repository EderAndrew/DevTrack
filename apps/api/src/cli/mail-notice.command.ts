import { randomUUID } from "node:crypto";
import { type AppConfig, InvalidConfigError, loadConfig } from "../platform/config/config.schema";
import { PrismaService } from "../platform/database/prisma.service";
import { resendSignature } from "../platform/mail/notices/resend.adapter";

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIo: CliIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

/** The Resend event each `--kind` posts (research N7). */
const EVENTS = {
  delivered: "email.delivered",
  bounced: "email.bounced",
  complained: "email.complained",
  failed: "email.failed",
} as const;

type NoticeKindArg = keyof typeof EVENTS;

interface ParsedArgs {
  kind: NoticeKindArg;
  deliveryId: string;
  badSignature: boolean;
  api: string | null;
}

const USAGE = "Uso: mail:notice --kind delivered|bounced|complained|failed --delivery <id> [--bad-signature] [--api <url>]";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMailNoticeArgs(argv: readonly string[]): ParsedArgs | { error: string } {
  const values: Record<string, string> = {};
  let badSignature = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    if (arg === "--bad-signature") {
      badSignature = true;
      continue;
    }
    const [name, inline] = arg.split("=", 2) as [string, string | undefined];
    if (!["--kind", "--delivery", "--api"].includes(name)) return { error: `Argumento desconhecido: ${arg}\n${USAGE}` };
    const value = inline ?? argv[++i];
    if (!value || value.startsWith("--")) return { error: `Informe o valor de ${name}.\n${USAGE}` };
    values[name] = value;
  }
  const kind = values["--kind"];
  if (!kind || !(kind in EVENTS)) return { error: USAGE };
  const deliveryId = values["--delivery"];
  if (!deliveryId || !UUID.test(deliveryId)) return { error: USAGE };
  return { kind: kind as NoticeKindArg, deliveryId, badSignature, api: values["--api"] ?? null };
}

/**
 * `pnpm --filter api mail:notice --kind bounced --delivery <id>` (017 quickstart, step 3): a
 * development helper that posts a Resend notice for the last attempt of a delivery to the local API,
 * signed with the local `MAIL_NOTICE_SECRET` (or, with `--bad-signature`, with a wrong one). It
 * refuses to run with `NODE_ENV=production`. Prints only the HTTP status. Exit 0 when the API
 * answered 200, 1 otherwise.
 */
export async function runMailNoticeCli(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, io: CliIo = defaultIo): Promise<number> {
  if (env.NODE_ENV === "production") {
    io.err("mail:notice é só para desenvolvimento; recusado com NODE_ENV=production.");
    return 1;
  }
  const args = parseMailNoticeArgs(argv);
  if ("error" in args) {
    io.err(args.error);
    return 1;
  }

  let config: AppConfig;
  try {
    config = loadConfig(env);
  } catch (error) {
    io.err(error instanceof InvalidConfigError ? error.message : "Configuração inválida.");
    return 1;
  }
  if (config.mail.notices.provider !== "resend") {
    io.err("Defina MAIL_NOTICE_PROVIDER=resend e MAIL_NOTICE_SECRET para simular avisos.");
    return 1;
  }

  const prisma = new PrismaService(config);
  let messageId: string | null;
  try {
    messageId = (await prisma.mailDelivery.findUnique({ where: { id: args.deliveryId }, select: { messageId: true } }))?.messageId ?? null;
  } finally {
    await prisma.$disconnect();
  }
  if (!messageId) {
    io.err("Envio não encontrado ou ainda sem tentativa.");
    return 1;
  }

  const now = new Date();
  const id = `msg_dev_${randomUUID().replaceAll("-", "")}`;
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const body = Buffer.from(
    JSON.stringify({
      type: EVENTS[args.kind],
      created_at: now.toISOString(),
      data: { message_id: messageId, ...(args.kind === "bounced" ? { bounce: { type: "Permanent" } } : {}) },
    }),
  );
  const secret = args.badSignature ? Buffer.from("assinatura-errada-de-proposito") : config.mail.notices.secret;
  const response = await fetch(`${(args.api ?? `http://localhost:${config.port}`).replace(/\/$/, "")}/api/mail/notices/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${resendSignature(secret, id, timestamp, body)}`,
    },
    body,
  });
  io.out(`aviso ${args.kind}: HTTP ${response.status}`);
  return response.status === 200 ? 0 : 1;
}
