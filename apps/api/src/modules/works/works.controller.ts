import { Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import {
  type CreateWorkRequest,
  CreateWorkRequestSchema,
  type ProgrammingLanguageList,
  type UpdateWorkRequest,
  UpdateWorkRequestSchema,
  UuidSchema,
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
}
