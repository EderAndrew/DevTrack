import "reflect-metadata";
import { hostname, userInfo } from "node:os";
import { NestFactory } from "@nestjs/core";
import { EmailSchema } from "@repo/contracts";
import { AppModule } from "../app.module";
import { AdminBootstrapService } from "../modules/admin-bootstrap/admin-bootstrap.service";
import { InvalidConfigError, loadConfig } from "../platform/config/config.schema";
import type { Mailer } from "../platform/mail/mailer";
import type { CliIo } from "./maintenance.command";

const USAGE = "Uso: pnpm admin:bootstrap --email <email> [--print-link]";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const defaultIo: CliIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

export type AdminBootstrapArgs = { email: string; printLink: boolean } | { error: string };

/**
 * Strict parser (FR-033): only `--email` and `--print-link`. A password, role, name or any
 * other argument is refused, so no credential can ever come through the command line.
 */
export function parseAdminBootstrapArgs(argv: readonly string[]): AdminBootstrapArgs {
  let email: string | undefined;
  let printLink = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    if (arg === "--print-link") {
      printLink = true;
    } else if (arg === "--email") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) return { error: "Informe o e-mail após --email." };
      email = value;
    } else if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
    } else {
      return { error: `Argumento desconhecido: ${arg}` };
    }
  }
  if (email === undefined) return { error: "O argumento --email é obrigatório." };
  const parsed = EmailSchema.safeParse(email);
  if (!parsed.success) return { error: "E-mail inválido." };
  return { email: parsed.data, printLink };
}

export interface AdminBootstrapCliOptions {
  /** Replaces the SMTP mailer (tests). */
  mailer?: Mailer;
}

/**
 * `pnpm admin:bootstrap --email <email> [--print-link]` (contracts/cli-admin-bootstrap.md).
 * Exit codes: 0 done, 1 usage/configuration/database error, 2 ADMIN already active,
 * 3 activation e-mail not sent now (the bootstrap stays PENDING; without `--print-link` the API
 * tries the e-mail again, with it the printed link is the channel). The token is printed only
 * with `--print-link`; errors never include secrets or connection strings.
 */
export async function runAdminBootstrapCli(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  io: CliIo = defaultIo,
  options: AdminBootstrapCliOptions = {},
): Promise<number> {
  const args = parseAdminBootstrapArgs(argv);
  if ("error" in args) {
    io.err(args.error);
    io.err(USAGE);
    return 1;
  }

  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    io.err(error instanceof InvalidConfigError ? error.message : "Configuração inválida.");
    return 1;
  }

  let app;
  try {
    app = await NestFactory.createApplicationContext(
      // No timers in the command: the API runs the maintenance and the e-mail retries (017).
      AppModule.forRoot({ ...config, maintenanceIntervalSeconds: 0, mailRetryIntervalSeconds: 0 }, { mailer: options.mailer }),
      { logger: ["error", "warn"] },
    );
  } catch {
    io.err("Falha ao iniciar o bootstrap administrativo.");
    return 1;
  }

  try {
    const result = await app.get(AdminBootstrapService).run({
      email: args.email,
      printLink: args.printLink,
      operator: { host: hostname(), user: userInfo().username },
    });

    switch (result.outcome) {
      case "REFUSED":
        io.err("Bootstrap administrativo já realizado");
        return 2;
      case "GRANTED":
        io.out(`ADMIN concedido a ${args.email}`);
        return 0;
      case "PENDING": {
        if (result.cancelledPrevious) io.out("Bootstrap pendente anterior cancelado");
        const until = dateTime.format(result.expiresAt);
        if (result.link) io.out(`Link de ativação: ${result.link}`);
        if (result.mail === "RETRYING") {
          io.err(
            `Aviso: não foi possível enviar agora o e-mail de ativação para ${args.email} (válido até ${until}); ` +
              "o e-mail será tentado de novo pela API.",
          );
          return 3;
        }
        if (result.mail === "NOT_SENT") {
          io.err(
            result.link
              ? `Aviso: e-mail não enviado; use o link impresso (válido até ${until}).`
              : `Aviso: e-mail não enviado: ${args.email} recusou a mensagem. Rode o comando de novo com outro e-mail ou use --print-link.`,
          );
          return 3;
        }
        io.out(`Link de ativação enviado para ${args.email} (válido até ${until})`);
        return 0;
      }
    }
  } catch {
    io.err("Falha no bootstrap administrativo.");
    return 1;
  } finally {
    await app.close();
  }
}
