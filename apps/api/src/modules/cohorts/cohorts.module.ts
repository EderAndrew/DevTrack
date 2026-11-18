import { Module } from "@nestjs/common";
import { CohortsController } from "./cohorts.controller";
import { CohortsService } from "./cohorts.service";

/** The MANAGER's turmas (027 US1): creation, editing, lifecycle, list and the page with its disciplinas da turma. */
@Module({
  controllers: [CohortsController],
  providers: [CohortsService],
  exports: [CohortsService],
})
export class CohortsModule {}
