import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/config.schema";
import { runInTransaction, type TransactionOptions, type Tx } from "./transaction";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  runInTransaction<T>(fn: (tx: Tx) => Promise<T>, options?: TransactionOptions): Promise<T> {
    return runInTransaction(this, fn, options);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
