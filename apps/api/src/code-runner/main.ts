import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { InvalidConfigError, loadConfig } from "../platform/config/config.schema";
import { CodeRunnerModule } from "./code-runner.module";

/**
 * `pnpm --filter api code-runner:start` (019 research B2): the Code Runner worker, a process of its
 * own next to the API, reading the same `.env`. The claim loop and the heartbeat arrive with US1
 * (`worker.ts`, `heartbeat.ts`); with `CODE_RUNNER_ENABLED=false` it claims nothing.
 */
async function bootstrap(): Promise<void> {
  // Configuration is validated before Nest starts: fail fast, naming only the variables.
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(CodeRunnerModule.forRoot(config), { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  logger.log({ enabled: config.codeRunner.enabled, runtime: config.codeRunner.worker.dockerRuntime }, "code_runner.started");
  app.enableShutdownHooks();
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(error instanceof InvalidConfigError ? `${error.message}\n` : "Falha ao iniciar o Code Runner.\n");
  process.exit(1);
});
