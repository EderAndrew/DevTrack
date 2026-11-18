import { Controller, Get, Query } from "@nestjs/common";
import { type CohortDirectoryPage, type CohortDirectoryQuery, CohortDirectoryQuerySchema } from "@repo/contracts";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { CohortDirectoryService } from "./cohort-directory.service";

/** The teacher's search of ACTIVE turmas to add a disciplina to (027 contracts/http-api.md "TEACHER"). */
@Controller("cohort-directory")
export class CohortDirectoryController {
  constructor(private readonly directory: CohortDirectoryService) {}

  @Get()
  @RequirePermissions("turmas.buscar")
  search(@Query(new ZodValidationPipe(CohortDirectoryQuerySchema)) query: CohortDirectoryQuery): Promise<CohortDirectoryPage> {
    return this.directory.search(query);
  }
}
