import { Module } from "@nestjs/common";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";

/** Identity-level account administration for ADMIN (FR-052, FR-054, FR-056). */
@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
