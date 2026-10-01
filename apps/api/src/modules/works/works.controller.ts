import { Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import {
  type CreateWorkRequest,
  CreateWorkRequestSchema,
  type ProgrammingLanguageList,
  type UpdateWorkRequest,
  UpdateWorkRequestSchema,
  UuidSchema,
  type WorkListQuery,
  WorkListQuerySchema,
  type WorkPage,
  type WorkStudentView,
  type WorkTeacherView,
  type WorkVersionRequest,
  WorkVersionRequestSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import {
  ZodBody,
  ZodValidationPipe,
} from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { WorksService } from "./works.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The teacher's own works (011 contracts/http-api.md, "Works"); other teachers' are 404. */
@Controller("works")
export class WorksController {
  constructor(private readonly works: WorksService) {}

  /** A manual work, DRAFT or APPROVED at the teacher's choice; origin MANUAL, no AI (US1). */
  @Post()
  @RequirePermissions("trabalhos.criar")
  create(
    @ZodBody(CreateWorkRequestSchema) body: CreateWorkRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkTeacherView> {
    return this.works.create(ctx.auth!, body, ctx.requestId);
  }

  /** The teacher's bank: filters, title search, keyset pages; ARCHIVED only when asked (US7). */
  @Get()
  @RequirePermissions("trabalhos.visualizar")
  list(
    @Query(new ZodValidationPipe(WorkListQuerySchema)) query: WorkListQuery,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkPage> {
    return this.works.list(ctx.auth!.userId, query);
  }

  /** The active languages of the shared catalog (research W18); declared before `:id`. */
  @Get("programming-languages")
  @RequirePermissions("trabalhos.visualizar")
  programmingLanguages(): Promise<ProgrammingLanguageList> {
    return this.works.programmingLanguages();
  }

  @Get(":id")
  @RequirePermissions("trabalhos.visualizar")
  get(
    @Param("id", idPipe) id: string,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkTeacherView> {
    return this.works.getForTeacher(ctx.auth!.userId, id);
  }

  /** "Ver como aluno": what a student will see of this work, with no answer key (US6). */
  @Get(":id/student-preview")
  @RequirePermissions("trabalhos.visualizar")
  studentPreview(
    @Param("id", idPipe) id: string,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkStudentView> {
    return this.works.studentPreview(ctx.auth!.userId, id);
  }

  /** The whole work again, with the version it was read at (US5, research W16). */
  @Put(":id")
  @RequirePermissions("trabalhos.editar")
  update(
    @Param("id", idPipe) id: string,
    @ZodBody(UpdateWorkRequestSchema) body: UpdateWorkRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkTeacherView> {
    return this.works.update(ctx.auth!, id, body, ctx.requestId);
  }

  /** DRAFT → APPROVED by a person; already APPROVED → 200 with no event (US5). */
  @Post(":id/approve")
  @HttpCode(200)
  @RequirePermissions("trabalhos.aprovar")
  approve(
    @Param("id", idPipe) id: string,
    @ZodBody(WorkVersionRequestSchema) body: WorkVersionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkTeacherView> {
    return this.works.approve(ctx.auth!, id, body, ctx.requestId);
  }

  /** DRAFT or APPROVED → ARCHIVED; already ARCHIVED → 200 with no event (US7). */
  @Post(":id/archive")
  @HttpCode(200)
  @RequirePermissions("trabalhos.arquivar")
  archive(
    @Param("id", idPipe) id: string,
    @ZodBody(WorkVersionRequestSchema) body: WorkVersionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkTeacherView> {
    return this.works.archive(ctx.auth!, id, body, ctx.requestId);
  }

  /** ARCHIVED → the status it had before (US7). */
  @Post(":id/restore")
  @HttpCode(200)
  @RequirePermissions("trabalhos.arquivar")
  restore(
    @Param("id", idPipe) id: string,
    @ZodBody(WorkVersionRequestSchema) body: WorkVersionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkTeacherView> {
    return this.works.restore(ctx.auth!, id, body, ctx.requestId);
  }
}
