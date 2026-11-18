import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type CohortEnrollmentPage,
  type CohortEnrollmentView,
  type DirectEnrollmentRequest,
  DirectEnrollmentRequestSchema,
  type EnrollmentListQuery,
  EnrollmentListQuerySchema,
  type StudentLookupRequest,
  StudentLookupRequestSchema,
  type StudentLookupResponse,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { DirectEnrollmentService } from "./direct-enrollment.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/**
 * The students of a turma, the MANAGER's (027 contracts/http-api.md, "MANAGER — turma"): the list, the lookup by
 * exact e-mail and the direct enrollment (FR-034). The e-mail always travels in a POST body.
 */
@Controller("cohorts/:id")
export class CohortEnrollmentsController {
  constructor(private readonly enrollments: DirectEnrollmentService) {}

  @Get("enrollments")
  @RequirePermissions("turmas.visualizar_alunos")
  list(
    @Param("id", idPipe) cohortId: string,
    @Query(new ZodValidationPipe(EnrollmentListQuerySchema)) query: EnrollmentListQuery,
  ): Promise<CohortEnrollmentPage> {
    return this.enrollments.list(cohortId, query);
  }

  @Post("student-lookup")
  @RequirePermissions("turmas.incluir_aluno")
  @HttpCode(200)
  lookup(
    @Param("id", idPipe) cohortId: string,
    @ZodBody(StudentLookupRequestSchema) body: StudentLookupRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<StudentLookupResponse> {
    return this.enrollments.lookup(ctx.auth!, cohortId, body.email, ctx.requestId);
  }

  @Post("enrollments")
  @RequirePermissions("turmas.incluir_aluno")
  enroll(
    @Param("id", idPipe) cohortId: string,
    @ZodBody(DirectEnrollmentRequestSchema) body: DirectEnrollmentRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<CohortEnrollmentView> {
    return this.enrollments.enroll(ctx.auth!, cohortId, body.email, ctx.requestId);
  }
}
