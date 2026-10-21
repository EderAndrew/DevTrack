import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { InvalidConfigError, loadConfig } from "../platform/config/config.schema";
import { CodeRunnerModule } from "./code-runner.module";
import { DockerSandbox } from "./sandbox/docker-sandbox";
import { defaultWorkerId } from "./tokens";

/**
 * `pnpm --filter api code-runner:start` (019 research B2): the Code Runner worker, a process of its
 * own next to the API, reading the same `.env`. It beats its heartbeat, settles stale runs and runs
 * the queued ones in Docker (`CODE_RUNNER_CONCURRENCY` at a time); with `CODE_RUNNER_ENABLED=false`
 * it claims nothing. SIGTERM stops claiming and waits for the runs in progress.
 */
async function bootstrap(): Promise<void> {
  // Configuration is validated before Nest starts: fail fast, naming only the variables.
  const config = loadConfig();
  const sandbox = new DockerSandbox(config.codeRunner.worker.dockerRuntime);
  const app = await NestFactory.createApplicationContext(CodeRunnerModule.forRoot(config, { sandbox, workerId: defaultWorkerId() }), { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();
  await app.init();
  logger.log(
    { enabled: config.codeRunner.enabled, runtime: config.codeRunner.worker.dockerRuntime, concurrency: config.codeRunner.worker.concurrency },
    "code_runner.started",
  );
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(error instanceof InvalidConfigError ? `${error.message}\n` : "Falha ao iniciar o Code Runner.\n");
  process.exit(1);
});
