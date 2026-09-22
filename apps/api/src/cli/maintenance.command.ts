import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { InvalidConfigError, loadConfig } from "../platform/config/config.schema";
import {
  MAINTENANCE_JOB_NAMES,
  MaintenanceService,
  UnknownMaintenanceJobError,
} from "../platform/maintenance/maintenance.service";

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIo: CliIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

type ParsedArgs = { job?: string } | { error: string };

export function parseMaintenanceArgs(argv: readonly string[]): ParsedArgs {
  let job: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    if (arg === "--job") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) return { error: "Informe o nome do job após --job." };
      job = value;
    } else if (arg.startsWith("--job=")) {
      job = arg.slice("--job=".length);
    } else {
      return { error: `Argumento desconhecido: ${arg}` };
    }
  }
  if (job !== undefined && !(MAINTENANCE_JOB_NAMES as readonly string[]).includes(job)) {
    return { error: `Job desconhecido: ${job}. Use um de: ${MAINTENANCE_JOB_NAMES.join(", ")}.` };
  }
  return { job };
}

/**
 * `pnpm --filter api maintenance:run [--job <nome>]` (contracts/maintenance-jobs.md).
 * Exit 0 on success, with or without removals, and when another instance is running;
 * 1 on any error, with a generic message and no personal data. Prints only counts.
 */
export async function runMaintenanceCli(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  io: CliIo = defaultIo,
): Promise<number> {
  const args = parseMaintenanceArgs(argv);
  if ("error" in args) {
    io.err(args.error);
    return 1;
  }

  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    io.err(error instanceof InvalidConfigError ? error.message : "Configuração inválida.");
    return 1;
  }

  // The scheduler stays off: this process runs once and exits.
  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot({ ...config, maintenanceIntervalSeconds: 0 }),
    { logger: ["error", "warn"] },
  );
  try {
    const result = await app.get(MaintenanceService).run({ job: args.job });
    if (result.status === "skipped") {
      io.out("manutenção em andamento em outra instância");
      return 0;
    }
    for (const { job, removed } of result.results) io.out(`${job}: ${removed} removido(s)`);
    return 0;
  } catch (error) {
    io.err(
      error instanceof UnknownMaintenanceJobError
        ? `Job indisponível nesta versão: ${error.job}.`
        : "Falha na manutenção.",
    );
    return 1;
  } finally {
    await app.close();
  }
}
