import { Controller, Get, Param, Query } from "@nestjs/common";
import { type EnrollmentListQuery, EnrollmentListQuerySchema, type EnrollmentPage, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { EnrollmentsService } from "./enrollments.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/**
 * Students of a teacher's own class (003 contracts/http-api.md, "Alunos da turma"). 027: the read-only roster
 * is the teacher's (`disciplinas_turma.visualizar_alunos`); ending an enrollment is the MANAGER's
 * (`POST /cohorts/:id/enrollments/:enrollmentId/remove`, 027/US5).
 */
@Controller("classes/:id/enrollments")
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Get()
  @RequirePermissions("disciplinas_turma.visualizar_alunos")
  list(
    @Param("id", idPipe) classId: string,
    @Query(new ZodValidationPipe(EnrollmentListQuerySchema)) query: EnrollmentListQuery,
    @Ctx() ctx: RequestContext,
  ): Promise<EnrollmentPage> {
    return this.enrollments.list(ctx.auth!.userId, classId, query);
  }
}
