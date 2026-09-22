import { type DynamicModule, Global, Module } from "@nestjs/common";
import type { AppConfig } from "./config.schema";

export const APP_CONFIG = Symbol("APP_CONFIG");

/**
 * Provides the already-validated configuration. The config is loaded by the entry point
 * (main.ts, CLIs, tests) before Nest starts, so a missing variable never gets this far.
 */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
