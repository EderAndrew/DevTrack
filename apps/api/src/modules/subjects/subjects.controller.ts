import { Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  type ChangeSubjectStatusRequest,
  ChangeSubjectStatusRequestSchema,
  type CreateSubjectRequest,
  CreateSubjectRequestSchema,
  type SubjectListQuery,
  SubjectListQuerySchema,
  type SubjectPage,
  type SubjectView,
  type UpdateSubjectRequest,
  UpdateSubjectRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { SubjectsService } from "./subjects.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** A teacher's own subjects (004 contracts/http-api.md, "Disciplinas"); other teachers' are 404. No delete (FR-002). */
@Controller("subjects")
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Get()
  @RequirePermissions("disciplinas.visualizar")
  list(
    @Query(new ZodValidationPipe(SubjectListQuerySchema)) query: SubjectListQuery,
    @Ctx() ctx: RequestContext,
  ): Promise<SubjectPage> {
    return this.subjects.list(ctx.auth!.userId, query);
  }

  @Post()
  @RequirePermissions("disciplinas.criar")
  create(@ZodBody(CreateSubjectRequestSchema) body: CreateSubjectRequest, @Ctx() ctx: RequestContext): Promise<SubjectView> {
    return this.subjects.create(ctx.auth!, body, ctx.requestId);
  }

  @Get(":id")
  @RequirePermissions("disciplinas.visualizar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<SubjectView> {
    return this.subjects.get(ctx.auth!.userId, id);
  }

  @Patch(":id")
  @RequirePermissions("disciplinas.editar")
  update(
    @Param("id", idPipe) id: string,
    @ZodBody(UpdateSubjectRequestSchema) body: UpdateSubjectRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<SubjectView> {
    return this.subjects.update(ctx.auth!, id, body, ctx.requestId);
  }

  @Post(":id/status")
  @RequirePermissions("disciplinas.editar")
  @HttpCode(200)
  changeStatus(
    @Param("id", idPipe) id: string,
    @ZodBody(ChangeSubjectStatusRequestSchema) body: ChangeSubjectStatusRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<SubjectView> {
    return this.subjects.changeStatus(ctx.auth!, id, body.status, ctx.requestId);
  }
}
