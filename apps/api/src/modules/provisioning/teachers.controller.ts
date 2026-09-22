import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type TeacherListQuery,
  TeacherListQuerySchema,
  type TeacherListResponse,
  type TeacherView,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { TeachersService } from "./teachers.service";

const idPipe = new ZodValidationPipe(UuidSchema);
/** Only `?status=` is read, as in Phase 001 (catalog note of contracts-package.md). */
const statusPipe = new ZodValidationPipe(TeacherListQuerySchema.shape.status);

/** The teaching registry (FR-050, FR-051): MANAGER's scope, ADMIN too (FR-005). */
@Controller("teachers")
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @RequirePermissions("professores.visualizar")
  async list(
    @Query("status", statusPipe) status: TeacherListQuery["status"],
  ): Promise<TeacherListResponse> {
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
