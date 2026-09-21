import { Global, Module } from "@nestjs/common";
import { MaintenanceService } from "./maintenance.service";

/** Jobs live in their own modules and register themselves on init. */
@Global()
@Module({
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
