import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { InvalidConfigError, loadConfig } from "./platform/config/config.schema";

async function bootstrap(): Promise<void> {
  // Configuration is validated before Nest starts: fail fast (FR-074).
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bufferLogs: true,
  });
  configureApp(app, config);
  if (config.host) await app.listen(config.port, config.host);
  else await app.listen(config.port);
}

bootstrap().catch((error: unknown) => {
  if (error instanceof InvalidConfigError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write("Falha ao iniciar a API.\n");
    console.error(error);
  }
  process.exit(1);
});
