import { Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  type ChangeClassStatusRequest,
  ChangeClassStatusRequestSchema,
  type ClassListQuery,
  ClassListQuerySchema,
  type ClassPage,
  type ClassView,
  type CreateClassRequest,
  CreateClassRequestSchema,
  type UpdateClassRequest,
  UpdateClassRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ClassesService } from "./classes.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/**
 * A teacher's own classes (003 contracts/http-api.md, "Turmas"); other teachers' classes are 404.
 * 027: the teacher's routes take the `disciplinas_turma.*` capabilities; the 003 create (`turmas.criar`,
 * now the MANAGER's) stays until US1/US3 replace it (T022, T038).
 */
@Controller("classes")
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  @RequirePermissions("disciplinas_turma.visualizar")
  list(
    @Query(new ZodValidationPipe(ClassListQuerySchema)) query: ClassListQuery,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassPage> {
    return this.classes.list(ctx.auth!.userId, query);
  }

  @Post()
  @RequirePermissions("turmas.criar")
  create(@ZodBody(CreateClassRequestSchema) body: CreateClassRequest, @Ctx() ctx: RequestContext): Promise<ClassView> {
    return this.classes.create(ctx.auth!, body, ctx.requestId);
  }

  @Get(":id")
  @RequirePermissions("disciplinas_turma.visualizar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<ClassView> {
    return this.classes.get(ctx.auth!.userId, id);
  }

  @Patch(":id")
  @RequirePermissions("disciplinas_turma.editar")
  update(
    @Param("id", idPipe) id: string,
    @ZodBody(UpdateClassRequestSchema) body: UpdateClassRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassView> {
    return this.classes.update(ctx.auth!, id, body, ctx.requestId);
  }

  @Post(":id/status")
  @RequirePermissions("disciplinas_turma.alterar_situacao")
  @HttpCode(200)
  changeStatus(
    @Param("id", idPipe) id: string,
    @ZodBody(ChangeClassStatusRequestSchema) body: ChangeClassStatusRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassView> {
    return this.classes.changeStatus(ctx.auth!, id, body.status, ctx.requestId);
  }
}
