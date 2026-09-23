import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  EmptyBodySchema,
  type EnrollmentListQuery,
  EnrollmentListQuerySchema,
  type EnrollmentPage,
  type EnrollmentView,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { EnrollmentsService } from "./enrollments.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** Students of a teacher's own class (003 contracts/http-api.md, "Alunos da turma"). */
@Controller("classes/:id/enrollments")
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Get()
  @RequirePermissions("turmas.visualizar_alunos")
  list(
    @Param("id", idPipe) classId: string,
    @Query(new ZodValidationPipe(EnrollmentListQuerySchema)) query: EnrollmentListQuery,
    @Ctx() ctx: RequestContext,
  ): Promise<EnrollmentPage> {
    return this.enrollments.list(ctx.auth!.userId, classId, query);
  }

  @Post(":enrollmentId/remove")
  @RequirePermissions("turmas.remover_aluno")
  @HttpCode(200)
  remove(
    @Param("id", idPipe) classId: string,
    @Param("enrollmentId", idPipe) enrollmentId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<EnrollmentView> {
    return this.enrollments.remove(ctx.auth!, classId, enrollmentId, ctx.requestId);
  }
}
