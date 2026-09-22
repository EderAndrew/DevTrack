import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { uuidSchema } from "../../platform/http/schemas";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { type TeacherListItem, TeachersService, type TeacherView } from "./teachers.service";

const statusSchema = z.enum(["INVITED", "ACTIVE", "SUSPENDED", "INACTIVE"]).optional();
const idPipe = new ZodValidationPipe(uuidSchema);

/** The teaching registry (FR-050, FR-051): MANAGER's scope, ADMIN too (FR-005). */
@Controller("teachers")
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @RequirePermissions("professores.visualizar")
  async list(
    @Query("status", new ZodValidationPipe(statusSchema)) status: z.output<typeof statusSchema>,
  ): Promise<{ items: TeacherListItem[] }> {
    return { items: await this.teachers.list(status) };
  }

  @Get(":userId")
  @RequirePermissions("professores.visualizar")
  get(@Param("userId", idPipe) userId: string): Promise<TeacherView> {
    return this.teachers.get(userId);
  }

  @Post(":userId/suspend")
  @RequirePermissions("professores.suspender")
  @HttpCode(200)
  suspend(@Param("userId", idPipe) userId: string, @Ctx() ctx: RequestContext): Promise<TeacherView> {
    return this.teachers.setStatus(userId, "SUSPENDED", ctx.auth!, ctx.requestId);
  }

  @Post(":userId/deactivate")
  @RequirePermissions("professores.desativar")
  @HttpCode(200)
  deactivate(@Param("userId", idPipe) userId: string, @Ctx() ctx: RequestContext): Promise<TeacherView> {
    return this.teachers.setStatus(userId, "INACTIVE", ctx.auth!, ctx.requestId);
  }

  @Post(":userId/reactivate")
  @RequirePermissions("professores.ativar")
  @HttpCode(200)
  reactivate(@Param("userId", idPipe) userId: string, @Ctx() ctx: RequestContext): Promise<TeacherView> {
    return this.teachers.setStatus(userId, "ACTIVE", ctx.auth!, ctx.requestId);
  }
}
